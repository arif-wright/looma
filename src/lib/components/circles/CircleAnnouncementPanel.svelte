<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CircleAnnouncement } from './types';

  export let pinned: CircleAnnouncement | null = null;
  export let canManage = false;

  const dispatch = createEventDispatcher<{
    announce: { title: string; body: string; pinned: boolean };
  }>();

  let title = '';
  let body = '';
  let pin = true;

  const submit = () => {
    if (!title.trim() || !body.trim()) return;
    dispatch('announce', {
      title: title.trim(),
      body: body.trim(),
      pinned: pin
    });
    title = '';
    body = '';
  };
</script>

<section class="announcements" aria-label="Circle announcements">
  <h3>Pinned Announcement</h3>
  {#if pinned}
    <article class="pinned">
      <strong>{pinned.title}</strong>
      <p>{pinned.body}</p>
    </article>
  {:else}
    <p class="empty">No pinned announcement.</p>
  {/if}

  {#if canManage}
    <div class="composer">
      <label>
        Title
        <input type="text" bind:value={title} maxlength="120" />
      </label>
      <label>
        Body
        <textarea rows="3" bind:value={body} maxlength="2000"></textarea>
      </label>
      <label class="pin-toggle">
        <input type="checkbox" bind:checked={pin} />
        Pin this announcement
      </label>
      <button type="button" on:click={submit} disabled={title.trim().length === 0 || body.trim().length === 0}>
        Post announcement
      </button>
    </div>
  {/if}
</section>

<style>
  .announcements { border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 0.8rem; padding: 0.8rem; background: rgba(15, 23, 42, 0.35); display: grid; gap: 0.55rem; }
  h3 { margin: 0; font-size: 0.92rem; letter-spacing: 0.04em; text-transform: uppercase; }
  .pinned { border-radius: 0.7rem; border: 1px solid rgba(125, 211, 252, 0.3); background: rgba(14, 116, 144, 0.16); padding: 0.7rem; }
  .pinned p { margin: 0.3rem 0 0; white-space: pre-wrap; }
  .empty { margin: 0; color: rgba(148, 163, 184, 0.94); }
  .composer { display: grid; gap: 0.45rem; }
  label { display: grid; gap: 0.2rem; font-size: 0.82rem; color: rgba(203, 213, 225, 0.88); }
  input, textarea { border-radius: 0.66rem; border: 1px solid rgba(148, 163, 184, 0.24); background: rgba(15, 23, 42, 0.78); color: #e2e8f0; padding: 0.55rem 0.62rem; }
  textarea { resize: vertical; }
  .pin-toggle { display: flex; align-items: center; gap: 0.45rem; }
  button { border: none; border-radius: 0.66rem; background: #22d3ee; color: #083344; padding: 0.45rem 0.8rem; font-weight: 700; cursor: pointer; justify-self: start; }
  button[disabled] { opacity: 0.55; cursor: default; }
</style>
