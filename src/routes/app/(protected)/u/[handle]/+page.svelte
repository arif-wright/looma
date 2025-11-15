<script lang="ts">
import { goto } from '$app/navigation';
import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';
import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
import ProfileHighlights from '$lib/components/profile/ProfileHighlights.svelte';
import ProfileFeed from '$lib/components/profile/ProfileFeed.svelte';
import type { PageData } from './$types';

  export let data: PageData;

  const profile = data.profile;
  const stats = {
    level: profile.level ?? null,
    xp: profile.xp ?? null,
    xp_next: profile.xp_next ?? null
  };

  const feed = data.feed ?? [];

  const handleEdit = () => {
    if (!data.isOwner) return;
    void goto('/app/profile/edit');
  };
</script>

<svelte:head>
  <title>{data.meta.title}</title>
  <meta property="og:title" content={data.meta.title} />
  <meta property="og:description" content={data.meta.description} />
  <meta property="og:url" content={data.meta.url} />
  <meta property="og:type" content="profile" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={data.meta.title} />
  <meta name="twitter:description" content={data.meta.description} />
  {#if data.meta.image}
    <meta property="og:image" content={data.meta.image} />
    <meta name="twitter:image" content={data.meta.image} />
  {/if}
</svelte:head>

<BackgroundStack class="profile-bg" />

<div class="relative z-10 min-h-screen safe-bottom pb-safe md:pb-8">
  <ProfileHeader
    profile={profile}
    coverUrl={profile.banner_url}
    avatarUrl={profile.avatar_url}
    canEdit={data.isOwner}
    canShare={!!data.shareUrl}
    shareUrl={data.shareUrl}
    isOwnProfile={data.isOwner}
    isFollowing={data.isFollowing ?? false}
    requested={data.requested ?? false}
    gated={data.gated ?? false}
    blocked={data.blocked ?? false}
    followCounts={data.followCounts ?? { followers: 0, following: 0 }}
    viewerCanFollow={!data.blocked && Boolean(data.viewerId)}
    personaArchetype={data.gated ? null : data.personaPublic?.archetype ?? null}
    personaColor={data.gated ? null : data.personaPublic?.color ?? null}
    on:edit={handleEdit}
  />

  <main class="profile-grid mt-6">
    <div class="profile-cols">
      <ProfileSidebar
        profile={profile}
        stats={stats}
        shards={profile.shards ?? null}
        featuredCompanion={data.featuredCompanion}
        achievements={profile.achievements ?? []}
        isOwner={false}
        hideCompanionActions={true}
        hidePrivate={true}
        bondMilestones={data.bondMilestones ?? []}
      />

      <div class="space-y-4">
        {#if data.pinnedPost}
          <section class="panel">
            <div class="flex items-center justify-between">
              <h3 class="panel-title m-0">Pinned</h3>
              <span class="text-[10px] uppercase tracking-wide text-white/40">Public</span>
            </div>
            <p class="mt-2 text-white/80 leading-relaxed">{data.pinnedPost?.body}</p>
          </section>
        {/if}

        <section class="panel" id="overview">
          <ProfileAbout bio={profile.bio} links={profile.links} pronouns={profile.pronouns} location={profile.location} />
        </section>

        <section class="panel" id="companions">
          <ProfileHighlights
            pinnedPost={data.pinnedPost}
            companion={data.featuredCompanion ? { name: data.featuredCompanion.name, mood: data.featuredCompanion.mood } : null}
            profileHandle={profile.handle}
          />
        </section>

        {#if data.gated && !data.isOwnProfile && !data.isFollowing}
          <section class="panel text-white/70">
            <h3 class="panel-title">This profile is private</h3>
            <p>Only approved followers can see {profile.display_name ?? profile.handle}'s activity.</p>
          </section>
        {:else if profile.show_feed !== false}
          <section id="activity" class="space-y-3">
            {#if feed.length === 0}
              <article class="panel text-sm text-white/60">No public activity yet.</article>
            {:else}
              {#each feed as item}
                <article class="panel">
                  <header class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                      <img src={item.author_avatar ?? profile.avatar_url} alt="" class="h-8 w-8 rounded-full ring-1 ring-white/15" />
                      <div class="min-w-0">
                        <div class="text-sm font-medium truncate">{item.author_name ?? profile.display_name ?? '@' + profile.handle}</div>
                        <div class="text-xs text-white/60 truncate">{item.when_label}</div>
                      </div>
                    </div>
                    {#if item.kind}
                      <span class="text-[10px] uppercase tracking-wide text-white/40">{item.kind}</span>
                    {/if}
                  </header>
                  <div class="mt-3">
                    {#if item.html}
                      {@html item.html}
                    {:else if item.text}
                      <p class="text-white/80 whitespace-pre-wrap">{item.text}</p>
                    {/if}
                  </div>
                  {#if item.media?.length}
                    <div class="mt-3 grid grid-cols-2 gap-2">
                      {#each item.media as media}
                        <img src={media.url} alt="" class="h-40 w-full rounded-lg object-cover ring-1 ring-white/10" />
                      {/each}
                    </div>
                  {/if}
                </article>
              {/each}
            {/if}
          </section>
        {/if}
      </div>
    </div>
  </main>
</div>
