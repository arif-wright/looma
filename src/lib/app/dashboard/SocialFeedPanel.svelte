<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import PostList from '$lib/social/PostList.svelte';
  import AvatarImage from '$lib/components/ui/AvatarImage.svelte';

  type FeedRow = {
    id: string;
    created_at: string;
    type: string;
    message: string;
    meta: any;
    user_id: string;
    author_name: string | null;
    author_handle: string | null;
    author_avatar: string | null;
    display_name?: string | null;
    handle?: string | null;
    avatar_url?: string | null;
    praise_count?: number;
    energy_count?: number;
    comment_count?: number;
    i_praised?: boolean;
    i_energized?: boolean;
  };

  const PAGE_SIZE = 5;
  const supabase: any = supabaseBrowser();

  let items: FeedRow[] = [];
  let loading = true;
  let moreLoading = false;
  let reachedEnd = false;
  let errMsg: string | null = null;
  let openComposerFor: string | null = null;
  let sendingCommentFor: string | null = null;
  let drafts: Record<string, string> = {};
  let currentUserId: string | null = null;
  let openId: string | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function relativeTime(value: string) {
    const ts = new Date(value).getTime();
    if (!Number.isFinite(ts)) return value;
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(value).toLocaleDateString();
  }

  const getAuthorHandle = (row: FeedRow) => row.author_handle ?? row.handle ?? null;
  const getAuthorName = (row: FeedRow) => {
    const handle = getAuthorHandle(row);
    return row.author_name ?? (row.display_name ?? (handle ? `@${handle}` : 'Someone'));
  };
  const getAuthorAvatar = (row: FeedRow) => row.author_avatar ?? row.avatar_url ?? null;

  function openCard(id: string) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    openId = id;
  }

  function scheduleClose() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    hideTimer = setTimeout(() => {
      openId = null;
      hideTimer = null;
    }, 120);
  }

  function immediateClose() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    openId = null;
  }

  function onKeydownCard(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      immediateClose();
    }
  }

  async function ensureUserId() {
    if (currentUserId) return currentUserId;
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    currentUserId = data.user?.id ?? null;
    return currentUserId;
  }

  async function loadInitial() {
    loading = true;
    reachedEnd = false;
    errMsg = null;
    try {
      const { data, error } = await supabase.rpc('get_public_feed', { p_limit: PAGE_SIZE });
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) {
        items = data as FeedRow[];
        reachedEnd = data.length < PAGE_SIZE;
      } else {
        items = [];
        reachedEnd = true;
      }
      drafts = {};
      sendingCommentFor = null;
      openComposerFor = null;
    } catch (err) {
      console.error('load social feed error', err);
      items = [];
      reachedEnd = true;
      errMsg = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (moreLoading || reachedEnd || items.length === 0) return;
    moreLoading = true;
    errMsg = null;
    const last = items.at(-1);
    if (!last) {
      moreLoading = false;
      reachedEnd = true;
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_public_feed', {
        p_limit: PAGE_SIZE,
        p_before: last.created_at
      });
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) {
        const existing = new Set(items.map((row) => row.id));
        const additions = (data as FeedRow[]).filter((row) => !existing.has(row.id));
        items = [...items, ...additions];
        reachedEnd = additions.length === 0 || data.length < PAGE_SIZE;
      } else {
        reachedEnd = true;
      }
    } catch (err) {
      console.error('load more social feed error', err);
      reachedEnd = true;
      errMsg = err instanceof Error ? err.message : String(err);
    } finally {
      moreLoading = false;
    }
  }

  async function toggleReaction(row: FeedRow, kind: 'praise' | 'energy', button?: HTMLButtonElement) {
    try {
      const userId = await ensureUserId();
      if (!userId) return;
      const isActive = kind === 'praise' ? !!row.i_praised : !!row.i_energized;
      if (isActive) {
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('user_id', userId)
          .eq('target_kind', 'event')
          .eq('target_id', row.id)
          .eq('kind', kind);
        if (error) throw error;
        if (kind === 'praise') {
          row.i_praised = false;
          row.praise_count = Math.max(0, (row.praise_count ?? 0) - 1);
        } else {
          row.i_energized = false;
          row.energy_count = Math.max(0, (row.energy_count ?? 0) - 1);
        }
      } else {
        const { error } = await supabase
          .from('reactions')
          .insert({ user_id: userId, target_kind: 'event', target_id: row.id, kind });
        if (error) throw error;
        if (kind === 'praise') {
          row.i_praised = true;
          row.praise_count = (row.praise_count ?? 0) + 1;
        } else {
          row.i_energized = true;
          row.energy_count = (row.energy_count ?? 0) + 1;
          if (button) triggerSpark(button);
        }
      }
      items = [...items];
    } catch (err) {
      console.error('toggleReaction error', err);
    }
  }

  let reactionChannel: ReturnType<typeof supabase.channel> | null = null;
  let commentChannel: ReturnType<typeof supabase.channel> | null = null;
  let eventChannel: ReturnType<typeof supabase.channel> | null = null;

  async function submitComment(eventId: string) {
    const text = drafts[eventId]?.trim();
    if (!text) return;
    sendingCommentFor = eventId;
    try {
      const userId = await ensureUserId();
      if (!userId) return;
      const { error } = await supabase
        .from('comments')
        .insert({ user_id: userId, author_id: userId, target_kind: 'event', target_id: eventId, body: text });
      if (error) throw error;
      drafts[eventId] = '';
      openComposerFor = null;
      await loadInitial();
    } catch (err) {
      console.error('submitComment error', err);
    } finally {
      sendingCommentFor = null;
    }
  }

  function triggerSpark(button: HTMLElement) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const wrap = document.createElement('span');
    wrap.className = 'spark-wrap';
    const count = 8;
    const palette = ['#6cf', '#f0f', '#0ff', '#9ff', '#f9f'];
    for (let i = 0; i < count; i += 1) {
      const spark = document.createElement('span');
      spark.className = 'spark-p';
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.6 - 0.3);
      const dist = 14 + Math.random() * 8;
      spark.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      spark.style.setProperty('--clr', `hsl(${Math.random() < 0.5 ? 185 : 300} 100% 60%)`);
      wrap.appendChild(spark);
    }
    button.appendChild(wrap);
    setTimeout(() => wrap.remove(), 550);
  }

  onMount(async () => {
    await loadInitial();
    eventChannel = supabase
      .channel('social-feed-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, () => loadInitial())
      .subscribe();
    reactionChannel = supabase
      .channel('social-feed-reactions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions', filter: 'target_kind=eq.event' },
        () => loadInitial()
      )
      .subscribe();
    commentChannel = supabase
      .channel('social-feed-comments')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: 'target_kind=eq.event' },
        () => loadInitial()
      )
      .subscribe();
  });

  onDestroy(() => {
    [eventChannel, reactionChannel, commentChannel].forEach((ch) => {
      if (ch) supabase.removeChannel(ch);
    });
    if (hideTimer) clearTimeout(hideTimer);
  });
</script>

<div class="panel">
  <h3 class="panel-title">Social Feed</h3>

  <section class="posts-section">
    <h4 class="section-title">Recent posts</h4>
    <PostList pageSize={5} emptyMessage="No posts yet." />
  </section>

  <div class="section-divider" aria-hidden="true"></div>

  {#if loading}
    <div class="panel-message">Loading…</div>
  {:else if errMsg}
    <div class="panel-message error">Error: {errMsg}</div>
  {:else if items.length === 0}
    <div class="panel-message">No public activity yet.</div>
  {:else}
    <ul class="feed" aria-live="polite">
      {#each items as row (row.id)}
        <li class="item">
          <div
            class="hover-wrap"
            role="group"
            on:mouseenter={() => openCard(row.id)}
            on:mouseleave={scheduleClose}
            on:focusin={() => openCard(row.id)}
            on:focusout={scheduleClose}
          >
            <a
              class="avatar-link"
              href={"/u/" + (getAuthorHandle(row) ?? row.user_id)}
              aria-haspopup="dialog"
              on:keydown={onKeydownCard}
            >
              <AvatarImage
                className="avatar"
                src={getAuthorAvatar(row)}
                name={getAuthorName(row)}
                handle={getAuthorHandle(row)}
                alt={getAuthorName(row)}
                loading="lazy"
              />
            </a>

            <a
              class="hover-card"
              href={"/u/" + (getAuthorHandle(row) ?? row.user_id)}
              role="dialog"
              aria-label="View profile"
              aria-hidden={openId === row.id ? 'false' : 'true'}
              data-open={openId === row.id}
              on:mouseenter={() => openCard(row.id)}
              on:mouseleave={scheduleClose}
              on:focusin={() => openCard(row.id)}
              on:focusout={scheduleClose}
              on:keydown={onKeydownCard}
            >
              <span class="hc-header">
                <AvatarImage
                  className="hc-avatar"
                  src={getAuthorAvatar(row)}
                  name={getAuthorName(row)}
                  handle={getAuthorHandle(row)}
                  alt=""
                  loading="lazy"
                />
                <span>
                  <b class="hc-name">{getAuthorName(row)}</b>
                  <span class="hc-handle">@{getAuthorHandle(row) ?? 'user'}</span>
                </span>
              </span>
              <span class="hc-stats">
                <span>Lvl <b>{row.meta?.level ?? ''}</b></span>
                <span><b>{row.meta?.bonded_count ?? ''}</b> bonded</span>
              </span>
              <span class="hc-cta">View profile →</span>
            </a>
          </div>
          <div class="content">
            <div class="header">
              <div class="meta">
                <a class="name-link" href={"/u/" + (getAuthorHandle(row) ?? row.user_id)}>
                  <span class="name">{getAuthorName(row)}</span>
                </a>
                <span class="dot" aria-hidden="true">•</span>
                <span class="when">{relativeTime(row.created_at)}</span>
              </div>
              <div class="right-actions">
                <button
                  class={`chip praise ${row.i_praised ? 'on' : ''}`}
                  aria-pressed={row.i_praised}
                  on:click={() => toggleReaction(row, 'praise')}
                >
                  💎 {row.praise_count ?? 0}
                </button>
                <button
                  class={`chip energy ${row.i_energized ? 'on' : ''}`}
                  aria-pressed={row.i_energized}
                  on:click={(event) => toggleReaction(row, 'energy', event.currentTarget as HTMLButtonElement)}
                >
                  ⚡ {row.energy_count ?? 0}
                </button>
                <button
                  class="chip comment"
                  on:click={() => {
                    openComposerFor = openComposerFor === row.id ? null : row.id;
                    drafts[row.id] = drafts[row.id] ?? '';
                  }}
                >
                  💬 {row.comment_count ?? 0}
                </button>
              </div>
            </div>
            <div class="message">{row.message}</div>
            {#if openComposerFor === row.id}
              <div class="composer">
                <input
                  class="field"
                  type="text"
                  maxlength="280"
                  placeholder="Write a supportive note…"
                  value={drafts[row.id] ?? ''}
                  on:input={(event) => drafts[row.id] = event.currentTarget.value}
                  on:keydown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      submitComment(row.id);
                    }
                  }}
                />
                <button
                  type="button"
                  class="send"
                  disabled={sendingCommentFor === row.id || !(drafts[row.id]?.trim())}
                  on:click={() => submitComment(row.id)}
                >
                  {sendingCommentFor === row.id ? 'Sending…' : 'Send'}
                </button>
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
    <div class="footer">
      {#if reachedEnd}
        <span class="end-text">End of feed</span>
      {:else}
        <button class="more-button" on:click={loadMore} disabled={moreLoading}>
          {moreLoading ? 'Loading…' : 'Load more'}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .panel {
    position: relative;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
  }

  .panel-title {
    font-weight: 600;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .panel-message {
    padding: 1rem 1.5rem;
    font-size: 0.9rem;
    opacity: 0.75;
  }

  .panel-message.error {
    color: #fca5a5;
    opacity: 1;
  }

  .posts-section {
    padding: 0 1rem 0.75rem;
  }

  .section-title {
    margin: 0 0 0.75rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .section-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 0 1rem 0.75rem;
  }

  .feed {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .item {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .item:last-child {
    border-bottom: none;
  }

  .avatar {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    object-fit: cover;
    margin-top: 2px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .hover-wrap {
    position: relative;
    display: inline-block;
    width: 28px;
  }

  .avatar-link {
    display: inline-block;
    text-decoration: none;
  }

  .hover-card {
    position: absolute;
    left: 34px;
    top: -6px;
    z-index: 30;
    display: none;
    min-width: 220px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(10, 12, 16, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    text-decoration: none;
    color: inherit;
  }

  .hover-wrap:hover .hover-card,
  .hover-wrap:focus-within .hover-card,
  .hover-card[data-open='true'] {
    display: block;
  }

  .hc-header {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 6px;
  }

  .hc-avatar {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .hc-name {
    font-weight: 600;
    display: block;
  }

  .hc-handle {
    opacity: 0.7;
    font-size: 12px;
  }

  .hc-stats {
    display: flex;
    gap: 12px;
    font-size: 12px;
    opacity: 0.9;
    margin-bottom: 6px;
  }

  .hc-cta {
    font-size: 12px;
    opacity: 0.9;
  }

  .content {
    min-width: 0;
    display: grid;
    gap: 0.35rem;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .meta {
    display: flex;
    gap: 0.45rem;
    align-items: baseline;
    font-size: 0.82rem;
  }

  .name-link {
    color: inherit;
    text-decoration: none;
  }

  .name {
    font-weight: 600;
  }

  .dot {
    opacity: 0.5;
  }

  .when {
    font-size: 0.72rem;
    opacity: 0.65;
  }

  .message {
    font-size: 0.88rem;
    line-height: 1.32;
    opacity: 0.9;
    margin-top: 0.2rem;
  }

  .right-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .chip {
    font-size: 11.5px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
  }

  .chip.on {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.18);
    box-shadow: 0 0 8px rgba(0, 255, 255, 0.25);
  }

  .chip:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .chip.energy:hover:not(:disabled),
  .chip.energy:focus-visible:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(0, 255, 255, 0.35);
    box-shadow: 0 0 6px rgba(0, 255, 255, 0.3), 0 0 12px rgba(255, 0, 255, 0.2);
  }

  .chip.energy:active:not(:disabled) {
    transform: scale(0.96);
    box-shadow: 0 0 10px rgba(255, 0, 255, 0.4), 0 0 20px rgba(0, 255, 255, 0.35);
  }

  .spark-wrap {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .spark-p {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: var(--clr, #6cf);
    filter: drop-shadow(0 0 6px var(--clr, #6cf));
    transform: translate(-50%, -50%) scale(0.6);
    animation: spark-pop 0.52s ease-out forwards;
  }

  @keyframes spark-pop {
    0% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(0.65);
    }
    60% {
      opacity: 1;
      transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.9);
    }
    100% {
      opacity: 0;
      transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0);
    }
  }

  .composer {
    margin-top: 6px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }

  .field {
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 13px;
    color: inherit;
  }

  .field::placeholder {
    color: rgba(255, 255, 255, 0.45);
  }

  .send {
    font-size: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    cursor: pointer;
  }

  .send:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .footer {
    padding: 0.75rem 1rem 1rem;
    display: flex;
    justify-content: center;
  }

  .more-button {
    font-size: 0.72rem;
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .more-button:hover:not(:disabled),
  .more-button:focus-visible:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .more-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .end-text {
    font-size: 0.72rem;
    opacity: 0.6;
  }

  @media (prefers-reduced-motion: reduce) {
    .chip,
    .more-button,
    .composer,
    .right-actions {
      transition: none;
    }

    .spark-p {
      animation: none;
      opacity: 0;
    }
  }
</style>
