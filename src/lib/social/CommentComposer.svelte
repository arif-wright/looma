<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import MentionAutocomplete from './MentionAutocomplete.svelte';
  import type { MentionOption, PostComment } from './types';

  type ApiResponse = { item?: PostComment | null; error?: string };

  export let postId: string;
  export let parentId: string | null = null;
  export let placeholder: string | undefined = undefined;
  export let autofocus = false;

  const dispatch = createEventDispatcher<{
    posted: { comment: PostComment; parentId: string | null };
    error: { message: string };
  }>();

  let text = '';
  let submitting = false;
  let errorMsg: string | null = null;
  let textareaEl: HTMLTextAreaElement | null = null;
  let composerEl: HTMLFormElement | null = null;
  let mirrorEl: HTMLDivElement | null = null;

  let mentionStart: number | null = null;
  let mentionQuery = '';
  let mentionItems: MentionOption[] = [];
  let mentionOpen = false;
  let mentionLoading = false;
  let mentionActive = 0;
  let mentionPosition = { top: 0, left: 0 };
  let mentionAbort: AbortController | null = null;
  let mentionTimer: ReturnType<typeof setTimeout> | null = null;

  const MIN_MENTION_LENGTH = 2;
  const FETCH_DELAY = 180;
  const MAX_LENGTH = 500;
  const MAX_LINES = 6;

  $: computedPlaceholder = placeholder ?? (parentId ? 'Write a reply…' : 'Add your thoughts…');

  function ensureMirror() {
    if (mirrorEl || typeof document === 'undefined') return;
    mirrorEl = document.createElement('div');
    mirrorEl.className = 'textarea-mirror';
    mirrorEl.style.position = 'absolute';
    mirrorEl.style.visibility = 'hidden';
    mirrorEl.style.whiteSpace = 'pre-wrap';
    mirrorEl.style.wordWrap = 'break-word';
    mirrorEl.style.pointerEvents = 'none';
    mirrorEl.style.top = '0';
    mirrorEl.style.left = '-9999px';
    document.body.appendChild(mirrorEl);
  }

  function syncMirrorStyles() {
    if (!textareaEl || !mirrorEl) return;
    const style = window.getComputedStyle(textareaEl);
    const props = [
      'boxSizing',
      'width',
      'height',
      'fontSize',
      'fontFamily',
      'fontWeight',
      'fontStyle',
      'letterSpacing',
      'textTransform',
      'textAlign',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'lineHeight'
    ] as const;
    for (const prop of props) {
      mirrorEl.style[prop as any] = style[prop as any];
    }
  }

  function getCaretOffset(position: number) {
    if (!textareaEl) return null;
    ensureMirror();
    if (!mirrorEl) return null;
    syncMirrorStyles();
    mirrorEl.textContent = textareaEl.value.slice(0, position);
    const marker = document.createElement('span');
    marker.textContent = textareaEl.value.slice(position) || ' ';
    mirrorEl.appendChild(marker);
    const top = marker.offsetTop - textareaEl.scrollTop;
    const left = marker.offsetLeft - textareaEl.scrollLeft;
    mirrorEl.removeChild(marker);
    return { top, left };
  }

  function resize() {
    if (!textareaEl) return;
    textareaEl.style.height = 'auto';
    const style = window.getComputedStyle(textareaEl);
    const lineHeight = parseFloat(style.lineHeight || '18');
    const padding = parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');
    const maxHeight = lineHeight * MAX_LINES + padding;
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, maxHeight)}px`;
  }

  function updateMentionPosition() {
    if (!mentionOpen || mentionStart === null || !textareaEl || !composerEl) return;
    const caret = getCaretOffset(mentionStart);
    if (!caret) return;
    const style = window.getComputedStyle(textareaEl);
    const borderTop = parseFloat(style.borderTopWidth || '0');
    const borderLeft = parseFloat(style.borderLeftWidth || '0');
    const lineHeight = parseFloat(style.lineHeight || '16');
    const textareaRect = textareaEl.getBoundingClientRect();
    const composerRect = composerEl.getBoundingClientRect();
    mentionPosition = {
      top: caret.top + lineHeight + borderTop + (textareaRect.top - composerRect.top),
      left: caret.left + borderLeft + (textareaRect.left - composerRect.left)
    };
  }

  function resetMention() {
    if (mentionTimer) {
      clearTimeout(mentionTimer);
      mentionTimer = null;
    }
    if (mentionAbort) {
      mentionAbort.abort();
      mentionAbort = null;
    }
    mentionStart = null;
    mentionQuery = '';
    mentionItems = [];
    mentionOpen = false;
    mentionLoading = false;
    mentionActive = 0;
  }

  function scheduleMentionFetch(query: string) {
    if (mentionTimer) clearTimeout(mentionTimer);
    if (mentionAbort) {
      mentionAbort.abort();
      mentionAbort = null;
    }
    if (query.length < MIN_MENTION_LENGTH) {
      resetMention();
      return;
    }
    mentionLoading = true;
    mentionTimer = setTimeout(async () => {
      mentionAbort = new AbortController();
      try {
        const res = await fetch(`/api/search/users?q=${encodeURIComponent(query)}`, {
          signal: mentionAbort.signal
        });
        if (!res.ok) throw new Error('Failed to search users');
        const payload = await res.json();
        mentionItems = Array.isArray(payload?.items) ? payload.items : [];
        mentionOpen = mentionItems.length > 0;
        mentionActive = 0;
        tick().then(updateMentionPosition);
      } catch (err) {
        if ((err as any)?.name !== 'AbortError') console.error('mention search error', err);
      } finally {
        if (!mentionAbort?.signal.aborted) {
          mentionLoading = false;
        }
      }
    }, FETCH_DELAY);
  }

  function updateMentionState() {
    if (!textareaEl) return;
    const cursor = textareaEl.selectionStart ?? 0;
    const content = textareaEl.value;
    for (let i = cursor - 1; i >= 0; i -= 1) {
      const char = content[i];
      if (char === '@') {
        const prev = i > 0 ? content[i - 1] : ' ';
        if (/[@\w]/.test(prev) && prev !== '@') {
          resetMention();
          return;
        }
        const fragment = content.slice(i + 1, cursor);
        if (!/^\w*$/.test(fragment)) {
          resetMention();
          return;
        }
        mentionStart = i;
        mentionQuery = fragment;
        scheduleMentionFetch(fragment);
        mentionOpen = true;
        return;
      }
      if (!/\w/.test(char)) {
        resetMention();
        return;
      }
    }
    resetMention();
  }

  function handleInput() {
    resize();
    errorMsg = null;
    updateMentionState();
  }

  function handleCaretMove() {
    updateMentionState();
    tick().then(updateMentionPosition);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (mentionOpen) {
      if (event.key === 'ArrowDown') {
        if (mentionItems.length > 0) {
          mentionActive = (mentionActive + 1) % mentionItems.length;
          event.preventDefault();
          tick().then(updateMentionPosition);
        }
        return;
      }
      if (event.key === 'ArrowUp') {
        if (mentionItems.length > 0) {
          mentionActive = (mentionActive - 1 + mentionItems.length) % mentionItems.length;
          event.preventDefault();
          tick().then(updateMentionPosition);
        }
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && mentionItems.length > 0) {
        event.preventDefault();
        insertMention(mentionItems[mentionActive] ?? mentionItems[0]);
        return;
      }
      if (event.key === 'Escape') {
        resetMention();
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSubmit();
    }
  }

  function insertMention(option: MentionOption | undefined) {
    if (!option?.handle || !textareaEl || mentionStart === null) return;
    const handle = option.handle.toLowerCase();
    const mentionText = `@${handle}`;
    const before = text.slice(0, mentionStart);
    const cursor = textareaEl.selectionStart ?? mentionStart;
    const after = text.slice(cursor);
    const separator = after.length === 0 || /^[^\s]/.test(after) ? ' ' : '';
    text = `${before}${mentionText}${separator}${after}`;
    const nextCaret = before.length + mentionText.length + separator.length;
    queueMicrotask(() => {
      textareaEl?.focus();
      textareaEl?.setSelectionRange(nextCaret, nextCaret);
    });
    resetMention();
    tick().then(updateMentionPosition);
  }

  async function handleSubmit() {
    if (submitting) return;
    const body = text.trim();
    if (!body) {
      errorMsg = 'Write a comment before posting.';
      return;
    }

    const payload = {
      postId,
      parentId: parentId ?? null,
      body
    };

    console.debug('[comment:submit]', {
      postId,
      parentId: parentId ?? null,
      preview: body.slice(0, 64)
    });

    submitting = true;
    errorMsg = null;
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) {
        const message = data?.error ?? res.statusText;
        throw new Error(message);
      }
      if (!data?.item) {
        throw new Error('Unexpected response');
      }
      text = '';
      resize();
      resetMention();
      dispatch('posted', { comment: data.item, parentId: payload.parentId });
      textareaEl?.focus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to post comment';
      errorMsg = message;
      dispatch('error', { message });
      console.error('comment composer error', err);
    } finally {
      submitting = false;
    }
  }

  onMount(() => {
    ensureMirror();
    tick().then(() => {
      resize();
      if (autofocus) textareaEl?.focus();
    });
  });

  onDestroy(() => {
    resetMention();
    if (mirrorEl?.parentNode) {
      mirrorEl.parentNode.removeChild(mirrorEl);
    }
    mirrorEl = null;
  });
</script>

<form class="comment-composer" bind:this={composerEl} on:submit|preventDefault={handleSubmit}>
  {#if errorMsg}
    <p class="error" role="alert">{errorMsg}</p>
  {/if}
  <textarea
    bind:this={textareaEl}
    bind:value={text}
    rows={2}
    maxlength={MAX_LENGTH}
    placeholder={computedPlaceholder}
    on:input={handleInput}
    on:keydown={handleKeydown}
    on:keyup={handleCaretMove}
    on:click={handleCaretMove}
    aria-label={parentId ? 'Write a reply' : 'Write a comment'}
  ></textarea>
  <div class="footer">
    <span class="hint">Use @ to mention someone</span>
    <button type="submit" class="post-btn" disabled={submitting || !text.trim()}>
      {submitting ? 'Posting…' : parentId ? 'Reply' : 'Post'}
    </button>
  </div>
  <MentionAutocomplete
    open={mentionOpen}
    loading={mentionLoading}
    items={mentionItems}
    active={mentionActive}
    position={mentionPosition}
    on:select={(event) => insertMention(event.detail)}
  />
</form>

<style>
  .comment-composer {
    display: grid;
    gap: 6px;
  }

  textarea {
    resize: vertical;
    min-height: 52px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    font: inherit;
  }

  textarea::placeholder {
    opacity: 0.75;
  }

  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .hint {
    font-size: 0.72rem;
    opacity: 0.6;
  }

  .post-btn {
    padding: 5px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .post-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .error {
    margin: 0;
    font-size: 0.78rem;
    color: #fca5a5;
  }
</style>
