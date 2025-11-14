<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let profile: Record<string, any> | null = null;
  export let account_private = false;
  export let show_shards = true;
  export let show_level = true;
  export let show_joined = true;
  export let show_location = true;
  export let show_achievements = true;
  export let show_feed = true;

  const dispatch = createEventDispatcher<{ updated: Record<string, any> }>();

  let display_name = profile?.display_name ?? '';
  let bio = profile?.bio ?? '';
  let pronouns = profile?.pronouns ?? '';
  let location = profile?.location ?? '';
  let links = Array.isArray(profile?.links) ? [...profile.links] : [];
  let saving = false;
  let message = '';
  let lastProfileRef: Record<string, any> | null = profile ?? null;

  const ensureLinks = () => {
    const next = [...links];
    while (next.length < 3) {
      next.push({ label: '', url: '' });
    }
    links = next.slice(0, 3);
  };

  ensureLinks();

  $: if (profile && profile !== lastProfileRef) {
    lastProfileRef = profile;
    display_name = profile.display_name ?? '';
    bio = profile.bio ?? '';
    pronouns = profile.pronouns ?? '';
    location = profile.location ?? '';
    links = Array.isArray(profile.links) ? [...profile.links] : [];
    ensureLinks();
  }

  const handleLinkChange = (index: number, field: 'label' | 'url', value: string) => {
    links = links.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry));
  };

  const save = async () => {
    saving = true;
    message = '';
    try {
      const res = await fetch('/app/profile/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name,
          bio,
          pronouns,
          location,
          links,
          account_private,
          show_shards,
          show_level,
          show_joined,
          show_location,
          show_achievements,
          show_feed
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        message = payload?.reason ?? 'Unable to save';
        return;
      }
      message = 'Saved';
      if (payload?.profile) {
        dispatch('updated', payload.profile);
      }
    } catch (err) {
      console.error('[profile details] save failed', err);
      message = 'Unexpected error';
    } finally {
      saving = false;
    }
  };
</script>

<form class="details-panel" on:submit|preventDefault={save}>
  <div class="grid md:grid-cols-2 gap-3">
    <label class="field">
      <span class="field-label">Display name</span>
      <input
        class="input input-sm w-full"
        name="display_name"
        bind:value={display_name}
        maxlength="40"
        autocomplete="name"
        placeholder="Your name"
      />
    </label>

    <label class="field">
      <span class="field-label">Pronouns</span>
      <input
        class="input input-sm w-full"
        name="pronouns"
        bind:value={pronouns}
        maxlength="30"
        placeholder="she/her · he/him · they/them"
      />
    </label>

    <label class="field md:col-span-2">
      <span class="field-label">Location</span>
      <input
        class="input input-sm w-full"
        name="location"
        bind:value={location}
        maxlength="60"
        placeholder="City, Country"
      />
    </label>

    <label class="field md:col-span-2">
      <span class="field-label">Bio <span class="opacity-60">(max 300)</span></span>
      <textarea
        class="textarea textarea-md w-full"
        name="bio"
        rows="4"
        maxlength="300"
        bind:value={bio}
        placeholder="Tell the world about yourself…"
      ></textarea>
    </label>
  </div>

  <div class="space-y-2">
    <span class="field-label">Links (up to 3, https)</span>
    {#each [0, 1, 2] as index}
      <div class="grid grid-cols-[1fr_2fr] gap-2">
        <input
          class="input input-sm w-full"
          name={`links[${index}].label`}
          bind:value={links[index].label}
          maxlength="40"
          placeholder="Label"
          on:input={(event) => handleLinkChange(index, 'label', (event.target as HTMLInputElement).value)}
        />
        <input
          class="input input-sm w-full"
          name={`links[${index}].url`}
          bind:value={links[index].url}
          placeholder="https://example.com"
          on:input={(event) => handleLinkChange(index, 'url', (event.target as HTMLInputElement).value)}
        />
      </div>
    {/each}
  </div>

  <div class="actions">
    <button class="btn btn-sm" type="submit" disabled={saving}>
      {saving ? 'Saving…' : 'Save profile'}
    </button>
    <span class="status-note">{message}</span>
  </div>
</form>

<style>
  .details-panel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field-label {
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.65);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .status-note {
    font-size: 0.8rem;
    opacity: 0.75;
  }
</style>
