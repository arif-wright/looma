<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';

  type ProfileLite = {
    id: string;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };

  type FriendItem = {
    friendId: string;
    createdAt: string;
    profile: ProfileLite;
    moderationStatus?: 'active' | 'muted' | 'suspended' | 'banned';
  };

  type RequestItem = {
    id: string;
    requesterId: string;
    recipientId: string;
    status: 'pending' | 'accepted' | 'declined' | 'canceled';
    note: string | null;
    createdAt: string;
    updatedAt: string;
    profile: ProfileLite;
  };

  type Tab = 'friends' | 'requests';

  let activeTab: Tab = 'friends';
  let loading = false;
  let friends: FriendItem[] = [];
  let incoming: RequestItem[] = [];
  let outgoing: RequestItem[] = [];
  let recent: RequestItem[] = [];
  let viewerCanModerate = false;
  let errorMessage: string | null = null;

  let addFriendOpen = false;
  let addFriendHandle = '';
  let addFriendNote = '';
  let addFriendLoading = false;
  let addFriendError: string | null = null;
  let addFriendInput: HTMLInputElement | null = null;
  $: incomingCount = incoming.length;
  $: outgoingCount = outgoing.length;
  $: totalRequests = incomingCount + outgoingCount;

  const userLabel = (profile: ProfileLite) => {
    if (profile.display_name) return profile.display_name;
    if (profile.handle) return `@${profile.handle}`;
    return profile.id.slice(0, 8);
  };

  const loadFriends = async () => {
    const res = await fetch('/api/friends/list', { headers: { 'cache-control': 'no-store' } });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(typeof payload?.message === 'string' ? payload.message : 'Failed to load friends.');
    }

    friends = Array.isArray(payload?.items) ? (payload.items as FriendItem[]) : [];
    viewerCanModerate = payload?.viewerCanModerate === true;
  };

  const loadRequests = async () => {
    const res = await fetch('/api/friends/requests', { headers: { 'cache-control': 'no-store' } });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(typeof payload?.message === 'string' ? payload.message : 'Failed to load requests.');
    }

    incoming = Array.isArray(payload?.incoming) ? (payload.incoming as RequestItem[]) : [];
    outgoing = Array.isArray(payload?.outgoing) ? (payload.outgoing as RequestItem[]) : [];
    recent = Array.isArray(payload?.recent) ? (payload.recent as RequestItem[]) : [];
  };

  const refresh = async () => {
    loading = true;
    errorMessage = null;
    try {
      await Promise.all([loadFriends(), loadRequests()]);
      if (incoming.length > 0 && activeTab === 'friends') {
        activeTab = 'requests';
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load friends data.';
    } finally {
      loading = false;
    }
  };

  const startMessage = async (friendId: string) => {
    const res = await fetch('/api/messenger/dm/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ otherUserId: friendId })
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok || typeof payload?.conversationId !== 'string') {
      errorMessage = typeof payload?.message === 'string' ? payload.message : 'Could not open chat.';
      return;
    }

    await goto(`/app/messages?conversationId=${encodeURIComponent(payload.conversationId)}`);
  };

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof payload?.message === 'string' ? payload.message : 'Request failed.');
    }
    return payload;
  };

  const onAccept = async (requestId: string) => {
    errorMessage = null;
    try {
      await post('/api/friends/accept', { requestId });
      await refresh();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Unable to accept request.';
    }
  };

  const onDecline = async (requestId: string) => {
    errorMessage = null;
    try {
      await post('/api/friends/decline', { requestId });
      await refresh();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Unable to decline request.';
    }
  };

  const onCancel = async (requestId: string) => {
    errorMessage = null;
    try {
      await post('/api/friends/cancel', { requestId });
      await refresh();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Unable to cancel request.';
    }
  };

  const onUnfriend = async (friendId: string) => {
    errorMessage = null;
    try {
      await post('/api/friends/unfriend', { friendId });
      await refresh();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Unable to unfriend.';
    }
  };

  const openAddFriend = async () => {
    addFriendOpen = true;
    addFriendError = null;
    await tick();
    addFriendInput?.focus();
  };

  const closeAddFriend = () => {
    if (addFriendLoading) return;
    addFriendOpen = false;
  };

  const submitAddFriend = async () => {
    const handle = addFriendHandle.trim();
    if (!handle || addFriendLoading) return;

    addFriendLoading = true;
    addFriendError = null;
    try {
      await post('/api/friends/request', {
        handle,
        note: addFriendNote.trim() ? addFriendNote.trim() : null
      });
      addFriendHandle = '';
      addFriendNote = '';
      addFriendOpen = false;
      activeTab = 'requests';
      await refresh();
    } catch (err) {
      addFriendError = err instanceof Error ? err.message : 'Could not send request.';
    } finally {
      addFriendLoading = false;
    }
  };

  onMount(async () => {
    await refresh();
  });
</script>

<SanctuaryPageFrame
  eyebrow="Connections"
  title="Friends"
  subtitle="Keep your closest people reachable, handle requests quickly, and move into messages without friction."
>
  <svelte:fragment slot="actions">
    <EmotionalChip tone="muted">{friends.length} friends</EmotionalChip>
    <EmotionalChip tone={incomingCount > 0 ? 'warm' : 'cool'}>{totalRequests} requests</EmotionalChip>
  </svelte:fragment>

  <div class="friends-shell">
    <header class="friends-header panel">
      <div>
        <p class="eyebrow">Connection hub</p>
        <h1>Your people in Looma</h1>
        <p class="lede">This should feel like a gentle bridge into messages and circles, not an admin screen.</p>
      </div>

      <div class="friends-pulse">
        <article class="pulse-card">
          <span class="pulse-card__label">Friends</span>
          <strong>{friends.length}</strong>
          <span>People you can message and stay connected with.</span>
        </article>
        <article class="pulse-card">
          <span class="pulse-card__label">Incoming</span>
          <strong>{incomingCount}</strong>
          <span>{incomingCount > 0 ? 'You have responses waiting.' : 'No incoming requests right now.'}</span>
        </article>
      </div>

      <div class="hero-actions">
        <button type="button" on:click={openAddFriend}>Add Friend</button>
      </div>
    </header>

    <div class="tabs" role="tablist" aria-label="Friends sections">
      <button type="button" role="tab" aria-selected={activeTab === 'friends'} class:active={activeTab === 'friends'} on:click={() => (activeTab = 'friends')}>Friends ({friends.length})</button>
      <button type="button" role="tab" aria-selected={activeTab === 'requests'} class:active={activeTab === 'requests'} on:click={() => (activeTab = 'requests')}>Requests ({totalRequests})</button>
    </div>

    {#if loading}
      <p class="state">Loading…</p>
    {:else if activeTab === 'friends'}
      <section class="panel friends-panel" aria-label="Friends list">
        {#if incoming.length > 0}
          <p class="hint" role="status">
            You have {incoming.length} incoming request{incoming.length === 1 ? '' : 's'}. Open the Requests tab to respond.
          </p>
        {/if}
        {#if friends.length === 0}
          <div class="empty-panel">
            <p class="state">No friends yet.</p>
            <p class="empty-copy">Start by sending a request to someone you want close inside Looma.</p>
          </div>
        {:else}
          <ul>
            {#each friends as friend (friend.friendId)}
              <li>
                <div>
                  <strong>{userLabel(friend.profile)}</strong>
                  {#if friend.profile.handle}
                    <small>@{friend.profile.handle}</small>
                  {/if}
                  {#if viewerCanModerate && friend.moderationStatus && friend.moderationStatus !== 'active'}
                    <small class="mod-badge">{friend.moderationStatus}</small>
                  {/if}
                </div>
                <div class="actions">
                  <button type="button" on:click={() => startMessage(friend.friendId)}>Message</button>
                  <button type="button" class="ghost" on:click={() => onUnfriend(friend.friendId)}>Unfriend</button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {:else}
      <section class="panel friends-panel" aria-label="Friend requests">
        <h2>Incoming</h2>
        {#if incoming.length === 0}
          <p class="state">No incoming requests.</p>
        {:else}
          <ul>
            {#each incoming as request (request.id)}
              <li>
                <div>
                  <strong>{userLabel(request.profile)}</strong>
                  {#if request.note}
                    <p>{request.note}</p>
                  {/if}
                </div>
                <div class="actions">
                  <button type="button" on:click={() => onAccept(request.id)}>Accept</button>
                  <button type="button" class="ghost" on:click={() => onDecline(request.id)}>Decline</button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}

        <h2>Outgoing</h2>
        {#if outgoing.length === 0}
          <p class="state">No outgoing requests.</p>
        {:else}
          <ul>
            {#each outgoing as request (request.id)}
              <li>
                <div>
                  <strong>{userLabel(request.profile)}</strong>
                  {#if request.note}
                    <p>{request.note}</p>
                  {/if}
                </div>
                <div class="actions">
                  <button type="button" class="ghost" on:click={() => onCancel(request.id)}>Cancel</button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}

        <h2>Recent</h2>
        {#if recent.length === 0}
          <p class="state">No recent request activity.</p>
        {:else}
          <ul>
            {#each recent as request (request.id)}
              <li>
                <div>
                  <strong>{userLabel(request.profile)}</strong>
                  <small class="request-status">{request.status}</small>
                  {#if request.note}
                    <p>{request.note}</p>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    {#if errorMessage}
      <p class="error" role="status">{errorMessage}</p>
    {/if}
  </div>
</SanctuaryPageFrame>

{#if addFriendOpen}
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="add-friend-title" tabindex="-1" on:keydown={(event) => event.key === 'Escape' && closeAddFriend()}>
    <button type="button" class="backdrop" aria-label="Close add friend dialog" on:click={closeAddFriend}></button>
    <div class="panel panel--modal">
      <h2 id="add-friend-title">Add Friend</h2>
      <label for="friend-handle">Handle</label>
      <input id="friend-handle" bind:this={addFriendInput} bind:value={addFriendHandle} type="text" placeholder="@handle" />
      <label for="friend-note">Note (optional)</label>
      <textarea id="friend-note" bind:value={addFriendNote} rows="3" maxlength="240"></textarea>
      {#if addFriendError}
        <p class="error" role="status">{addFriendError}</p>
      {/if}
      <div class="actions">
        <button type="button" class="ghost" on:click={closeAddFriend} disabled={addFriendLoading}>Cancel</button>
        <button type="button" on:click={submitAddFriend} disabled={addFriendLoading || addFriendHandle.trim().length === 0}>
          {addFriendLoading ? 'Sending...' : 'Send Request'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .friends-shell {
    width: min(100%, 62rem);
    margin: 0 auto;
    padding: 1rem 0 calc(6rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 1rem;
  }

  .friends-header {
    display: grid;
    gap: 0.95rem;
    padding: 1rem;
    border-radius: 1.25rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(160deg, rgba(24, 20, 15, 0.78), rgba(12, 16, 19, 0.88)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.14), transparent 42%);
  }

  .eyebrow {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.78);
  }

  h1 {
    margin: 0.15rem 0 0;
    font-family: var(--san-font-display);
    font-size: clamp(1.5rem, 4vw, 2.2rem);
    color: rgba(249, 243, 230, 0.98);
  }

  .lede,
  .empty-copy {
    margin: 0.35rem 0 0;
    color: rgba(223, 211, 188, 0.78);
    line-height: 1.5;
  }

  .friends-pulse {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .pulse-card {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(180deg, rgba(31, 25, 17, 0.64), rgba(15, 18, 20, 0.88)),
      radial-gradient(circle at top, rgba(214, 190, 141, 0.08), transparent 56%);
    padding: 0.85rem;
    display: grid;
    gap: 0.16rem;
  }

  .pulse-card__label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.72);
  }

  .pulse-card strong {
    color: rgba(248, 241, 227, 0.98);
    font-size: 1rem;
  }

  .pulse-card span:last-child {
    color: rgba(219, 208, 185, 0.74);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .hero-actions {
    display: flex;
    justify-content: flex-start;
  }

  .tabs {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .tabs button {
    border: 1px solid rgba(214, 190, 141, 0.16);
    background: rgba(43, 33, 20, 0.24);
    color: rgba(245, 238, 225, 0.95);
    border-radius: 999px;
    padding: 0.5rem 0.85rem;
    cursor: pointer;
    font-weight: 600;
  }

  .tabs button.active {
    background: rgba(214, 190, 141, 0.16);
    border-color: rgba(214, 190, 141, 0.34);
  }

  .friends-panel {
    border-radius: 1.25rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background: rgba(21, 18, 15, 0.72);
    padding: 1rem;
  }

  h2 {
    margin: 1rem 0 0.55rem;
    font-size: 0.96rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(220, 209, 184, 0.88);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.7rem;
  }

  li {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    align-items: center;
    padding: 0.82rem;
    border: 1px solid rgba(214, 190, 141, 0.14);
    border-radius: 1rem;
    background: rgba(31, 25, 17, 0.56);
  }

  strong {
    display: block;
    color: rgba(245, 238, 225, 0.96);
  }

  small {
    color: rgba(198, 184, 154, 0.88);
  }

  .mod-badge {
    margin-left: 0.4rem;
    border: 1px solid rgba(248, 113, 113, 0.5);
    background: rgba(127, 29, 29, 0.35);
    color: rgba(254, 226, 226, 0.95);
    border-radius: 999px;
    padding: 0.02rem 0.4rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.66rem;
  }

  .request-status {
    display: inline-flex;
    margin-top: 0.22rem;
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 999px;
    padding: 0.05rem 0.42rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.64rem;
    color: rgba(224, 242, 254, 0.9);
  }

  p {
    margin: 0.22rem 0 0;
    color: rgba(223, 211, 188, 0.84);
    font-size: 0.84rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  button {
    border: 1px solid rgba(214, 190, 141, 0.16);
    border-radius: 999px;
    background: linear-gradient(125deg, rgba(212, 173, 92, 0.94), rgba(166, 121, 61, 0.92));
    color: rgba(22, 16, 9, 0.96);
    padding: 0.5rem 0.82rem;
    cursor: pointer;
    font-weight: 700;
  }

  button.ghost {
    background: rgba(43, 33, 20, 0.24);
    color: rgba(245, 238, 225, 0.94);
    font-weight: 600;
  }

  .state {
    margin-top: 0.2rem;
    color: rgba(220, 209, 184, 0.8);
  }

  .hint {
    margin: 0.2rem 0 0.75rem;
    padding: 0.65rem 0.75rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(214, 190, 141, 0.22);
    background: rgba(43, 33, 20, 0.28);
    color: rgba(246, 237, 218, 0.94);
    font-size: 0.88rem;
  }

  .error {
    margin-top: 0.2rem;
    color: #fda4af;
  }

  .empty-panel {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.14);
    background: rgba(31, 25, 17, 0.56);
    padding: 0.9rem;
  }

  .modal {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    z-index: 120;
    padding: 1rem;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: rgba(2, 6, 23, 0.76);
  }

  .panel--modal {
    position: relative;
    z-index: 1;
    width: min(30rem, 100%);
    border: 1px solid rgba(214, 190, 141, 0.18);
    border-radius: 1rem;
    background:
      linear-gradient(160deg, rgba(24, 20, 15, 0.88), rgba(12, 16, 19, 0.94)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.12), transparent 42%);
    padding: 1rem;
  }

  label {
    display: block;
    margin-top: 0.65rem;
    color: rgba(223, 211, 188, 0.88);
    font-size: 0.85rem;
  }

  input,
  textarea {
    width: 100%;
    margin-top: 0.3rem;
    border-radius: 0.72rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background: rgba(18, 20, 21, 0.78);
    color: rgba(245, 238, 225, 0.95);
    padding: 0.65rem 0.74rem;
  }

  textarea {
    resize: vertical;
  }

  @media (max-width: 960px) {
    .friends-pulse {
      grid-template-columns: 1fr;
    }

    li {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none;
    }
  }
</style>
