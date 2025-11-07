<script lang="ts">
  import Panel from '$lib/components/ui/Panel.svelte';

  export type ProfileLink = {
    label: string;
    url: string;
  };

  export let bio: string | null = null;
  export let links: ProfileLink[] = [];

  const sanitizeLink = (link: ProfileLink | Record<string, unknown> | null | undefined) => {
    if (!link || typeof link !== 'object') return null;
    const rawLabel = String((link as any).label ?? '').trim();
    const rawUrl = String((link as any).url ?? '').trim();
    if (!rawLabel || !rawUrl) return null;
    const href = /^[a-z]+:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    return { label: rawLabel, url: href } satisfies ProfileLink;
  };

  $: safeLinks = Array.isArray(links)
    ? links
        .map((entry) => sanitizeLink(entry))
        .filter((entry): entry is ProfileLink => Boolean(entry))
    : [];

  $: hasBio = typeof bio === 'string' && bio.trim().length > 0;
</script>

<Panel title="About" className="profile-panel profile-about">
  <div class="about-body">
    <section>
      <h3>Bio</h3>
      {#if hasBio}
        <p class="bio">{bio}</p>
      {:else}
        <p class="empty">No bio yet.</p>
      {/if}
    </section>

    <section>
      <h3>Links</h3>
      {#if safeLinks.length > 0}
        <ul class="link-grid">
          {#each safeLinks as link (link.url + link.label)}
            <li>
              <a href={link.url} target="_blank" rel="noreferrer noopener">
                {link.label}
              </a>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">No links yet.</p>
      {/if}
    </section>
  </div>
</Panel>

<style>
  :global(.profile-panel.profile-about > div) {
    padding-top: 0;
  }

  .about-body {
    display: grid;
    gap: 1.5rem;
  }

  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.7);
  }

  .bio {
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.6;
  }

  .link-grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.5rem;
  }

  .link-grid a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 0.8rem;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    text-decoration: none;
    background: rgba(255, 255, 255, 0.03);
    transition: border-color 140ms ease, transform 140ms ease;
  }

  .link-grid a:hover,
  .link-grid a:focus-visible {
    border-color: rgba(94, 242, 255, 0.7);
    transform: translateY(-1px);
    outline: none;
  }

  .empty {
    margin: 0;
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.9rem;
  }
</style>
