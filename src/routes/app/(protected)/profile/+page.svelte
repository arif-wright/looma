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
  $: latestAchievement =
    Array.isArray(profile?.achievements) && profile.achievements.length > 0 ? profile.achievements[0] : null;
  $: activeCompanionName = featuredCompanionCard?.name ?? 'No featured companion';
  $: activeCompanionMood = featuredCompanionCard?.mood ?? 'Quiet';
  $: featuredKeepsake = data.featuredKeepsake ?? null;
  $: featuredCompanionRewards = data.featuredCompanionRewards ?? [];
  $: keepsakeShelfItems = [
    ...featuredCompanionRewards.filter((reward) => reward.rewardKey === featuredKeepsake?.rewardKey),
    ...featuredCompanionRewards.filter((reward) => reward.rewardKey !== featuredKeepsake?.rewardKey)
  ].slice(0, 3);
  $: companionBondText = featuredCompanionCard
    ? `Affection ${featuredCompanionCard.affection ?? 0} · Trust ${featuredCompanionCard.trust ?? 0}`
    : 'Choose a featured companion to make your profile feel alive.';
  $: levelValue = stats?.level ?? profile?.level ?? 1;
  $: energyValue = stats?.energy ?? null;
  let keepsakeSaving = false;
  let keepsakeError: string | null = null;

  const setFeaturedKeepsake = async (rewardKey: string, companionId: string) => {
    keepsakeSaving = true;
    keepsakeError = null;
    try {
      const response = await fetch('/api/profile/featured-keepsake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rewardKey, companionId })
      });
      if (!response.ok) {
        keepsakeError = 'Could not feature that keepsake right now.';
        return;
      }
      await invalidateAll();
    } catch {
      keepsakeError = 'Could not feature that keepsake right now.';
    } finally {
      keepsakeSaving = false;
    }
  };

  const clearFeaturedKeepsake = async () => {
    keepsakeSaving = true;
    keepsakeError = null;
    try {
      const response = await fetch('/api/profile/featured-keepsake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clear: true })
      });
      if (!response.ok) {
        keepsakeError = 'Could not clear the featured keepsake right now.';
        return;
      }
      await invalidateAll();
    } catch {
      keepsakeError = 'Could not clear the featured keepsake right now.';
    } finally {
      keepsakeSaving = false;
    }
  };
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
      <section class="profile-pulse panel" aria-label="Profile pulse">
        <div class="profile-pulse__intro">
          <p class="profile-pulse__eyebrow">Profile pulse</p>
          <h2>{profile.display_name ?? profile.handle ?? 'Your Looma identity'}</h2>
          <p>
            Your profile should feel like a living companion space, not just a bio card. Keep your bond, reflections,
            and current energy visible.
          </p>
        </div>

        <div class="profile-pulse__cards">
          <article class="pulse-tile">
            <span class="pulse-tile__label">Featured companion</span>
            <strong>{activeCompanionName}</strong>
            <span>{activeCompanionMood}</span>
            <p>{companionBondText}</p>
            {#if featuredKeepsake}
              <div class={`keepsake-badge keepsake-badge--${featuredKeepsake.tone ?? 'bond'}`}>
                <span>Featured keepsake</span>
                <strong>{featuredKeepsake.title}</strong>
              </div>
            {/if}
          </article>

          <article class="pulse-tile">
            <span class="pulse-tile__label">Current level</span>
            <strong>Level {levelValue}</strong>
            <span>{energyValue == null ? 'Energy hidden' : `${energyValue} energy available`}</span>
            <p>Shape your presence through rituals, missions, and daily check-ins.</p>
          </article>

          <article class="pulse-tile">
            <span class="pulse-tile__label">Latest milestone</span>
            <strong>{latestAchievement?.title ?? 'No recent achievements yet'}</strong>
            <span>{latestAchievement?.when_label ?? 'Play, connect, and care to unlock your first milestone.'}</span>
            <p>Your visible progress helps the whole profile feel inhabited.</p>
          </article>
        </div>

        <div class="profile-pulse__actions" aria-label="Profile shortcuts">
          <a class="pulse-action pulse-action--primary" href="/app/companions">Open companions</a>
          <a class="pulse-action" href="/app/memory">Open journal</a>
          <a class="pulse-action" href="/app/home">Go to sanctuary</a>
          <a class="pulse-action" href="/app/settings">Settings</a>
        </div>

        {#if keepsakeShelfItems.length > 0}
          <div class="profile-shelf" aria-label="Featured keepsake shelf">
            <div class="profile-shelf__head">
              <h3>Keepsake shelf</h3>
              <span>{featuredKeepsake ? 'Curated for your profile' : 'Recent companion keepsakes'}</span>
            </div>
            <div class="profile-shelf__grid">
              {#each keepsakeShelfItems as reward (reward.rewardKey)}
                <div class={`profile-shelf__item profile-shelf__item--${reward.tone ?? 'bond'} ${featuredKeepsake?.rewardKey === reward.rewardKey ? 'is-featured' : ''}`}>
                  <span class="profile-shelf__label">{featuredKeepsake?.rewardKey === reward.rewardKey ? 'Featured' : 'Shelf'}</span>
                  <strong>{reward.title}</strong>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>

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
                <div class="featured-keepsake-panel">
                  <div class="featured-keepsake-panel__head">
                    <h4>Featured keepsake</h4>
                    {#if featuredKeepsake}
                      <button class="keepsake-action keepsake-action--ghost" type="button" disabled={keepsakeSaving} on:click={clearFeaturedKeepsake}>
                        Clear
                      </button>
                    {/if}
                  </div>
                  {#if featuredKeepsake}
                    <div class={`keepsake-card keepsake-card--${featuredKeepsake.tone ?? 'bond'}`}>
                      <strong>{featuredKeepsake.title}</strong>
                      <p>{featuredKeepsake.body}</p>
                    </div>
                  {:else}
                    <p class="text-muted">Choose one keepsake from this companion to carry onto your profile and sanctuary.</p>
                  {/if}

                  {#if featuredCompanionRewards.length > 0}
                    <div class="keepsake-list">
                      {#each featuredCompanionRewards as reward (reward.rewardKey)}
                        <article class={`keepsake-list__item keepsake-list__item--${reward.tone ?? 'bond'}`}>
                          <div>
                            <strong>{reward.title}</strong>
                            <p>{reward.body}</p>
                          </div>
                          <button
                            class="keepsake-action"
                            type="button"
                            disabled={keepsakeSaving || featuredKeepsake?.rewardKey === reward.rewardKey}
                            on:click={() => setFeaturedKeepsake(reward.rewardKey, reward.companionId)}
                          >
                            {featuredKeepsake?.rewardKey === reward.rewardKey ? 'Featured' : 'Feature'}
                          </button>
                        </article>
                      {/each}
                    </div>
                  {/if}

                  {#if keepsakeError}
                    <p class="keepsake-error" role="alert">{keepsakeError}</p>
                  {/if}
                </div>
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
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(162deg, rgba(18, 24, 31, 0.7), rgba(10, 14, 18, 0.76)),
      radial-gradient(circle at 84% 2%, rgba(214, 190, 141, 0.12), transparent 52%);
    box-shadow: 0 28px 54px rgba(6, 11, 20, 0.32);
  }

  :global(.profile-shell .panel) {
    border-radius: 1.2rem;
    border-color: rgba(214, 190, 141, 0.16);
    background: linear-gradient(164deg, rgba(24, 20, 15, 0.72), rgba(14, 17, 19, 0.78));
  }

  :global(.profile-shell .panel-title) {
    color: rgba(245, 238, 225, 0.92);
    letter-spacing: 0.02em;
  }

  :global(.profile-shell .btn-ghost) {
    border-radius: 0.9rem;
    border-color: rgba(214, 190, 141, 0.18);
    background: rgba(43, 33, 20, 0.24);
    color: rgba(245, 238, 225, 0.95);
  }

  .profile-pulse {
    display: grid;
    gap: 1rem;
    margin-bottom: 1rem;
    background:
      linear-gradient(165deg, rgba(24, 20, 15, 0.76), rgba(14, 17, 19, 0.86)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.12), transparent 46%);
  }

  .profile-pulse__intro h2 {
    margin: 0.18rem 0 0;
    font-family: var(--san-font-display);
    font-size: clamp(1.4rem, 4vw, 2rem);
    color: rgba(249, 243, 230, 0.98);
  }

  .profile-pulse__intro p:last-child {
    margin: 0.5rem 0 0;
    color: rgba(221, 209, 185, 0.82);
    line-height: 1.5;
  }

  .profile-pulse__eyebrow {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.78);
  }

  .profile-pulse__cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.8rem;
  }

  .pulse-tile {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(180deg, rgba(31, 25, 17, 0.64), rgba(15, 18, 20, 0.88)),
      radial-gradient(circle at top, rgba(214, 190, 141, 0.08), transparent 56%);
    padding: 0.9rem;
    display: grid;
    gap: 0.2rem;
  }

  .pulse-tile__label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.74);
  }

  .pulse-tile strong {
    color: rgba(248, 241, 227, 0.98);
    font-size: 1rem;
    line-height: 1.25;
  }

  .pulse-tile span:not(.pulse-tile__label) {
    color: rgba(228, 217, 194, 0.82);
    font-size: 0.82rem;
  }

  .pulse-tile p {
    margin: 0.2rem 0 0;
    color: rgba(208, 196, 171, 0.72);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .keepsake-badge {
    margin-top: 0.55rem;
    border-radius: 0.95rem;
    border: 1px solid rgba(214, 190, 141, 0.22);
    padding: 0.62rem 0.72rem;
    display: grid;
    gap: 0.08rem;
    background: rgba(35, 29, 22, 0.42);
  }

  .keepsake-badge span {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.62rem;
    color: rgba(232, 219, 187, 0.72);
  }

  .keepsake-badge strong {
    font-size: 0.86rem;
    color: rgba(248, 241, 227, 0.98);
  }

  .keepsake-badge--care,
  .keepsake-card--care,
  .keepsake-list__item--care {
    border-color: rgba(132, 214, 179, 0.24);
    background: rgba(21, 41, 36, 0.48);
  }

  .keepsake-badge--social,
  .keepsake-card--social,
  .keepsake-list__item--social {
    border-color: rgba(233, 162, 122, 0.24);
    background: rgba(45, 27, 24, 0.48);
  }

  .keepsake-badge--mission,
  .keepsake-card--mission,
  .keepsake-list__item--mission {
    border-color: rgba(222, 186, 103, 0.24);
    background: rgba(43, 33, 20, 0.48);
  }

  .keepsake-badge--play,
  .keepsake-card--play,
  .keepsake-list__item--play {
    border-color: rgba(124, 220, 224, 0.24);
    background: rgba(20, 36, 45, 0.48);
  }

  .keepsake-badge--bond,
  .keepsake-card--bond,
  .keepsake-list__item--bond {
    border-color: rgba(214, 190, 141, 0.24);
    background: rgba(35, 29, 22, 0.48);
  }

  .featured-keepsake-panel {
    margin-top: 1rem;
    display: grid;
    gap: 0.75rem;
  }

  .featured-keepsake-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .featured-keepsake-panel__head h4 {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(248, 241, 227, 0.94);
  }

  .keepsake-card,
  .keepsake-list__item {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.18);
    padding: 0.8rem 0.9rem;
  }

  .keepsake-card strong,
  .keepsake-list__item strong {
    color: rgba(248, 241, 227, 0.96);
    font-size: 0.92rem;
  }

  .keepsake-card p,
  .keepsake-list__item p {
    margin: 0.28rem 0 0;
    color: rgba(224, 214, 192, 0.8);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .keepsake-list {
    display: grid;
    gap: 0.65rem;
  }

  .keepsake-list__item {
    display: flex;
    justify-content: space-between;
    gap: 0.9rem;
    align-items: start;
  }

  .keepsake-action {
    min-width: 5.6rem;
    min-height: 2.35rem;
    border-radius: 999px;
    border: 1px solid rgba(214, 190, 141, 0.22);
    background: rgba(214, 190, 141, 0.12);
    color: rgba(248, 241, 227, 0.94);
    font-weight: 600;
  }

  .keepsake-action--ghost {
    min-width: auto;
    padding: 0 0.85rem;
    background: rgba(43, 33, 20, 0.24);
  }

  .keepsake-action:disabled {
    opacity: 0.72;
  }

  .keepsake-error {
    margin: 0;
    color: rgba(255, 184, 184, 0.94);
    font-size: 0.82rem;
  }

  .profile-pulse__actions {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.7rem;
  }

  .profile-shelf {
    display: grid;
    gap: 0.75rem;
  }

  .profile-shelf__head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .profile-shelf__head h3 {
    margin: 0;
    font-size: 1rem;
    color: rgba(248, 241, 227, 0.94);
  }

  .profile-shelf__head span {
    color: rgba(221, 209, 185, 0.72);
    font-size: 0.8rem;
  }

  .profile-shelf__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .profile-shelf__item {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.18);
    padding: 0.8rem;
    display: grid;
    gap: 0.12rem;
  }

  .profile-shelf__item.is-featured {
    box-shadow: 0 0 0 1px rgba(214, 190, 141, 0.24);
  }

  .profile-shelf__label {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.62rem;
    color: rgba(232, 219, 187, 0.72);
  }

  .profile-shelf__item strong {
    font-size: 0.86rem;
    color: rgba(248, 241, 227, 0.98);
    line-height: 1.35;
  }

  .profile-shelf__item--care {
    border-color: rgba(132, 214, 179, 0.24);
    background: rgba(21, 41, 36, 0.48);
  }

  .profile-shelf__item--social {
    border-color: rgba(233, 162, 122, 0.24);
    background: rgba(45, 27, 24, 0.48);
  }

  .profile-shelf__item--mission {
    border-color: rgba(222, 186, 103, 0.24);
    background: rgba(43, 33, 20, 0.48);
  }

  .profile-shelf__item--play {
    border-color: rgba(124, 220, 224, 0.24);
    background: rgba(20, 36, 45, 0.48);
  }

  .profile-shelf__item--bond {
    border-color: rgba(214, 190, 141, 0.24);
    background: rgba(35, 29, 22, 0.48);
  }

  .pulse-action {
    min-height: 2.8rem;
    border-radius: 999px;
    border: 1px solid rgba(214, 190, 141, 0.18);
    background: rgba(43, 33, 20, 0.24);
    color: rgba(245, 238, 225, 0.95);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 0.95rem;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .pulse-action--primary {
    background: linear-gradient(125deg, rgba(212, 173, 92, 0.92), rgba(166, 121, 61, 0.92));
    border-color: rgba(214, 190, 141, 0.34);
    color: rgba(23, 17, 10, 0.96);
  }

  .companion-panel {
    display: grid;
    gap: 1rem;
  }

  .featured-slot {
    border: 1px solid rgba(214, 190, 141, 0.16);
    border-radius: 20px;
    padding: 1rem;
    background: rgba(43, 33, 20, 0.18);
  }

  .text-muted {
    color: rgba(214, 203, 180, 0.72);
  }

  @media (max-width: 900px) {
    :global(.profile-shell) {
      border-radius: 1.08rem;
      padding-top: 0.75rem;
    }

    .profile-pulse__cards {
      grid-template-columns: 1fr;
    }

    .profile-pulse__actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .profile-shelf__grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    :global(.profile-shell) {
      border-radius: 0.96rem;
    }

    :global(.profile-shell .panel) {
      border-radius: 1rem;
    }

    .profile-pulse {
      gap: 0.85rem;
    }

    .profile-pulse__actions {
      grid-template-columns: 1fr;
    }

    .keepsake-list__item {
      flex-direction: column;
    }

    .keepsake-action {
      width: 100%;
    }

    .pulse-action {
      min-height: 2.9rem;
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.profile-shell .btn-ghost) {
      transition: none !important;
    }
  }
</style>
