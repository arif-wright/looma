<script lang="ts">
  import Panel from '$lib/components/ui/Panel.svelte';

  type ProfileLink = {
    label: string;
    url: string;
  };

  export let bio: string | null = null;
  export let pronouns: string | null = null;
  export let location: string | null = null;
  export let links: ProfileLink[] = [];
</script>

<Panel title="About" className="profile-panel profile-about panel-glass">
  <div class="meta-line">
    {#if pronouns}
      <span class="chip">{pronouns}</span>
    {/if}
    {#if location}
      <span class="chip">{location}</span>
    {/if}
  </div>

  <div class="section">
    <h3>Bio</h3>
    {#if bio && bio.trim().length > 0}
      <p class="bio">{bio}</p>
    {:else}
      <p class="ghost">Add a short bio to share your vibe.</p>
    {/if}
  </div>

  <div class="section">
    <h3>Links</h3>
    {#if links.length > 0}
      <ul class="link-grid">
        {#each links as link (link.url)}
          <li>
            <a href={link.url} target="_blank" rel="noreferrer noopener">
              {link.label}
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="ghost">Add a link to your favorite hangout.</p>
    {/if}
  </div>
</Panel>

<style>
  .section + .section {
    margin-top: 1rem;
  }

  h3 {
    margin: 0 0 0.35rem;
    font-size: 0.9rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
  }

  .bio {
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.6;
  }

  .meta-line {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .chip {
    padding: 0.25rem 0.8rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 0.8rem;
  }

  .ghost {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.55);
    font-style: italic;
  }

  .link-grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.6rem;
  }

  .link-grid a {
    display: inline-flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.45rem 0.85rem;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    text-decoration: none;
    font-size: 0.9rem;
  }
</style>
