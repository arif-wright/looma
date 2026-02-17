<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
  import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';
  import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
  import ProfileHighlights from '$lib/components/profile/ProfileHighlights.svelte';
  import ProfileFeed from '$lib/components/profile/ProfileFeed.svelte';
  import SmartComposer from '$lib/components/profile/SmartComposer.svelte';
  import CompanionCard from '$lib/components/companions/CompanionCard.svelte';
  import EditProfileModal from '$lib/components/profile/EditProfileModal.svelte';
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
  import type { PageData } from './$types';
  import type { PostRow } from '$lib/social/types';
  import { currentProfile } from '$lib/stores/profile';
  import type { Companion } from '$lib/stores/companions';

  export let data: PageData;

  type LooseRecord = Record<string, any>;

  let profile: LooseRecord = { ...data.profile };
  const stats = data.stats;
  const bondGenesisEnabled = Boolean(data.flags?.bond_genesis);
  const companionCount = data.companionCount ?? 0;
  const showBondGenesisCta = Boolean(data.isOwner && bondGenesisEnabled && companionCount === 0);
let featuredCompanionCard: Companion | null = data.featuredCompanion
    ? ({ ...data.featuredCompanion, owner_id: (data.profile?.id ?? profile?.id ?? '') as string } as Companion)
    : null;

let feedRef: InstanceType<typeof ProfileFeed> | null = null;
let editOpen = false;
  const appUrl = import.meta.env.PUBLIC_APP_URL || '';
  const legacyShareMatch = data.shareUrl?.match(/^(.*)\/app\/u\/[^/]+$/);
  const legacyShareBase = legacyShareMatch ? legacyShareMatch[1] : data.shareUrl ?? '';

  $: sidebarAchievements = (profile?.achievements as LooseRecord[]) ?? [];

  $: shareUrl = (() => {
    const identifier = profile.handle || data.user?.id;
    if (!identifier) return '';
    if (appUrl) return `${appUrl}/u/${identifier}`;
    if (legacyShareBase) return `${legacyShareBase}/app/u/${identifier}`;
    return '';
  })();

  const handleEdit = () => {
    if (!data.isOwner) return;
    editOpen = true;
  };

  const handleComposerPosted = (event: CustomEvent<PostRow>) => {
    feedRef?.prepend(event.detail);
  };

  function onProfileUpdated(event: CustomEvent<Record<string, any>>) {
    const patch = event.detail ?? {};
    if (!Object.keys(patch).length) return;
    profile = { ...profile, ...patch };
    data.profile = { ...data.profile, ...patch };
    currentProfile.update((p) => (p ? { ...p, ...patch } : p));
  }
  $: if (data.featuredCompanion) {
    featuredCompanionCard = {
      ...(data.featuredCompanion as Companion),
      owner_id: (data.profile?.id ?? profile?.id ?? '') as string
    };
  } else {
    featuredCompanionCard = null;
  }
  $: profileTitle = data.isOwner ? 'Your Profile' : `${profile.display_name ?? profile.handle ?? 'Profile'}`;
</script>

<div class="relative z-10 min-h-screen safe-bottom pb-safe md:pb-8">
  <ProfileHeader
    profile={profile}
    coverUrl={profile.banner_url}
    avatarUrl={profile.avatar_url}
    canEdit={data.isOwner}
    canShare={!!shareUrl}
    shareUrl={shareUrl}
    isOwnProfile={data.isOwner}
    followCounts={data.followCounts ?? { followers: 0, following: 0 }}
    showBondGenesisCta={showBondGenesisCta}
    personaArchetype={data.persona?.archetype ?? null}
    personaColor={data.persona?.color ?? null}
    on:edit={handleEdit}
  />

  <SanctuaryPageFrame
    class="profile-shell"
    eyebrow="Identity"
    title={profileTitle}
    subtitle="Shape your presence, share reflections, and keep your companion context visible."
  >
    <svelte:fragment slot="actions">
      <EmotionalChip tone="muted">{companionCount} companions</EmotionalChip>
      {#if data.isOwner && bondGenesisEnabled}
        <EmotionalChip tone="cool">Bond genesis on</EmotionalChip>
      {/if}
    </svelte:fragment>

    <main class="profile-grid mt-6">
      <div class="profile-cols">
        <div class="flex flex-col gap-4">
          <ProfileSidebar
            profile={profile}
            stats={stats}
            shards={data.walletShards ?? null}
            featuredCompanion={data.featuredCompanion}
            achievements={sidebarAchievements}
            isOwner={data.isOwner}
            companionHidden={data.companionHidden ?? false}
            bondMilestones={data.bondMilestones ?? []}
          />
        </div>

        <div class="space-y-4">
          <SmartComposer avatarUrl={profile.avatar_url} on:posted={handleComposerPosted} />

          {#if data.pinnedPost}
            <section class="panel" aria-labelledby="pinned-heading">
              <div class="flex items-center justify-between">
                <h3 id="pinned-heading" class="panel-title m-0">Pinned</h3>
                <span class="text-[10px] uppercase tracking-wide text-white/40">Profile</span>
              </div>
              <p class="mt-2 text-white/80 leading-relaxed">{data.pinnedPost?.body}</p>
            </section>
          {/if}

          <section class="panel" id="overview">
            <ProfileAbout bio={profile.bio} links={profile.links} pronouns={profile.pronouns} location={profile.location} />
          </section>

          <section class="panel companion-panel" id="companions">
            <ProfileHighlights
              pinnedPost={data.pinnedPost}
              companion={data.featuredCompanion ? { name: data.featuredCompanion.name, mood: data.featuredCompanion.mood } : null}
              profileHandle={profile.handle}
            />
            <div class="featured-slot">
              <h3 class="panel-title">Featured Companion</h3>
              {#if featuredCompanionCard}
                <CompanionCard companion={featuredCompanionCard} showActions={false} compact={true} />
                <a class="btn-ghost mt-3 inline-flex w-full justify-center" href="/app/companions">Open care hub</a>
              {:else}
                <p class="text-muted">
                  Set an active companion from your <a class="underline" href="/app/companions">roster</a> to
                  highlight them here.
                </p>
              {/if}
            </div>
          </section>

          <section id="activity" class="space-y-4">
            <ProfileFeed
              bind:this={feedRef}
              authorIdentifier={profile.handle || profile.id}
              initialItems={data.posts ?? []}
              initialCursor={data.nextCursor}
            />
          </section>
        </div>
      </div>
    </main>
  </SanctuaryPageFrame>

  {#if data.isOwner}
    <EditProfileModal bind:open={editOpen} {profile} on:profileUpdated={onProfileUpdated} onClose={() => (editOpen = false)} />
  {/if}
</div>

<style>
  :global(.profile-shell) {
    padding-top: 1rem;
    border-radius: 1.4rem;
    border: 1px solid rgba(197, 214, 241, 0.18);
    background:
      linear-gradient(162deg, rgba(17, 29, 66, 0.52), rgba(10, 18, 43, 0.48)),
      radial-gradient(circle at 84% 2%, rgba(112, 188, 255, 0.1), transparent 52%);
    box-shadow: 0 28px 54px rgba(6, 11, 28, 0.32);
  }

  :global(.profile-shell .panel) {
    border-radius: 1.2rem;
    border-color: rgba(196, 214, 241, 0.2);
    background: linear-gradient(164deg, rgba(19, 31, 68, 0.62), rgba(12, 22, 50, 0.56));
  }

  :global(.profile-shell .panel-title) {
    color: rgba(236, 243, 252, 0.9);
    letter-spacing: 0.02em;
  }

  :global(.profile-shell .btn-ghost) {
    border-radius: 0.9rem;
    border-color: rgba(196, 214, 241, 0.28);
    background: rgba(33, 50, 99, 0.44);
    color: rgba(233, 241, 252, 0.95);
  }

  .companion-panel {
    display: grid;
    gap: 1rem;
  }

  .featured-slot {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 20px;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.03);
  }

  .text-muted {
    color: rgba(255, 255, 255, 0.65);
  }

  @media (max-width: 900px) {
    :global(.profile-shell) {
      border-radius: 1.08rem;
      padding-top: 0.75rem;
    }
  }

  @media (max-width: 640px) {
    :global(.profile-shell) {
      border-radius: 0.96rem;
    }

    :global(.profile-shell .panel) {
      border-radius: 1rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.profile-shell .btn-ghost) {
      transition: none !important;
    }
  }
</style>
