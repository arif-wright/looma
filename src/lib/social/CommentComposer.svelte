<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import MentionAutocomplete from './MentionAutocomplete.svelte';
  import type { MentionOption, PostComment } from './types';

  type CommentResponse = {
    item: PostComment | null;
    error?: string;
  };

  export let postId: string;
  export let parentId: string | null = null;
  export let placeholder: string | undefined = undefined;
  export let autofocus = false;
  export let isPublic = true;

  const dispatch = createEventDispatcher<{ posted: { comment: PostComment; parentId: string | null } }>();

  let body = '';
  let sending = false;
  let errorMsg: string | null = null;
  let textareaEl: HTMLTextAreaElement | null = null;
  let composerEl: HTMLDivElement | null = null;
  let mirrorEl: HTMLDivElement | null = null;

  let mentionStart: number | null = null;
  let mentionQuery = '';
  let mentionItems: MentionOption[] = [];
  let mentionOpen = false;
  let mentionLoading = false;
  let mentionActive = 0;
  let mentionPosition = { top: 0, left: 0 };
  let mentionAbort: AbortController | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const MIN_MENTION_LENGTH = 2;
  const MAX_LINES = 6;
  const MAX_LENGTH = 500;
  const FETCH_DELAY = 180;

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
    const properties = [
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
    for (const prop of properties) {
      mirrorEl.style[prop as any] = style[prop as any];
    }
    mirrorEl.scrollTop = textareaEl.scrollTop;
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

  function clearMentionFetch() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (mentionAbort) {
      mentionAbort.abort();
      mentionAbort = null;
    }
  }

  function resetMention() {
    clearMentionFetch();
    mentionStart = null;
    mentionQuery = '';
    mentionItems = [];
    mentionOpen = false;
    mentionLoading = false;
    mentionActive = 0;
  }

  function findMention(text: string, cursor: number) {
    for (let i = cursor - 1; i >= 0; i -= 1) {
      const char = text[i];
      if (char === '@') {
        if (i > 0) {
          const prev = text[i - 1];
          if (/[@A-Za-z0-9_]/.test(prev)) {
            return null;
          }
        }
        const fragment = text.slice(i + 1, cursor);
        if (!/^[A-Za-z0-9_]*$/.test(fragment)) {
          return null;
        }
        return { start: i, query: fragment };
      }
      if (!/[A-Za-z0-9_]/.test(char)) {
        return null;
      }
    }
    return null;
  }

  function scheduleMentionFetch(query: string) {
    clearMentionFetch();
    if (query.length < MIN_MENTION_LENGTH) {
      mentionItems = [];
      mentionLoading = false;
      return;
    }
    mentionLoading = true;
    debounceTimer = setTimeout(async () => {
      if (mentionAbort) mentionAbort.abort();
      mentionAbort = new AbortController();
      try {
        const res = await fetch(`/api/search/users?q=${encodeURIComponent(query)}`, {
          signal: mentionAbort.signal
        });
        if (!res.ok) {
          throw new Error('Failed to fetch users');
        }
        const payload = await res.json();
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        mentionItems = rows;
        mentionActive = 0;
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        mentionItems = [];
      } finally {
        if (mentionAbort?.signal.aborted) return;
        mentionLoading = false;
      }
    }, FETCH_DELAY);
  }

  function updateMentionState() {
    if (!textareaEl) return;
    const cursor = textareaEl.selectionStart ?? 0;
    const found = findMention(body, cursor);
    if (!found) {
      resetMention();
      return;
    }
    mentionStart = found.start;
    mentionQuery = found.query;
    mentionOpen = true;
    scheduleMentionFetch(found.query);
    tick().then(updateMentionPosition);
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

  function handleInput() {
    resize();
    errorMsg = null;
    updateMentionState();
  }

  function handleCursorMove() {
    updateMentionState();
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
      submit();
    }
  }

  function insertMention(option: MentionOption | undefined) {
    if (!option || !option.handle || !textareaEl || mentionStart === null) return;
    const handle = option.handle.toLowerCase();
    const mentionText = `@${handle}`;
    const before = body.slice(0, mentionStart);
    const cursor = textareaEl.selectionStart ?? mentionStart;
    const after = body.slice(cursor);
    const needsSpace = after.length === 0 || /^[^\s]/.test(after) ? ' ' : '';
    body = `${before}${mentionText}${needsSpace}${after}`;
    const nextCaret = before.length + mentionText.length + (needsSpace ? 1 : 0);
    tick().then(() => {
      if (textareaEl) {
        textareaEl.focus();
        textareaEl.setSelectionRange(nextCaret, nextCaret);
      }
      resize();
    });
    resetMention();
  }

  async function submit() {
    if (sending) return;
    const text = body.trim();
    if (!text) {
      errorMsg = 'Write a comment before posting.';
      return;
    }
    sending = true;
    errorMsg = null;
    const payload = {
      postId,
      parentId: parentId ?? null,
      body: text,
      isPublic
    };
    console.debug('[comment:submit]', {
      postId,
      parentId: parentId ?? null,
      preview: text.slice(0, 64)
    });

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errorMsg = data?.error ?? 'Failed to publish comment.';
        return;
      }
      const payload = (await res.json()) as CommentResponse;
      const comment = payload?.item ?? null;
      if (!comment) {
        errorMsg = payload?.error ?? 'Failed to publish comment.';
        return;
      }
      body = '';
      resetMention();
      await tick();
      resize();
      dispatch('posted', { comment, parentId });
      textareaEl?.focus();
    } catch (err) {
      console.error('comment composer error', err);
      errorMsg = err instanceof Error ? err.message : 'Unexpected error';
    } finally {
      sending = false;
    }
  }

  export function focus() {
    textareaEl?.focus();
  }

  onMount(() => {
    ensureMirror();
    tick().then(() => {
      resize();
      if (autofocus) {
        textareaEl?.focus();
      }
    });
  });

  onDestroy(() => {
    clearMentionFetch();
    if (mirrorEl?.parentNode) {
      mirrorEl.parentNode.removeChild(mirrorEl);
    }
    mirrorEl = null;
  });
</script>

<div class="comment-composer" bind:this={composerEl}>
  {#if errorMsg}
    <p class="error" role="alert">{errorMsg}</p>
  {/if}
  <textarea
    bind:this={textareaEl}
    bind:value={body}
    rows={2}
    maxlength={MAX_LENGTH}
    placeholder={computedPlaceholder}
    on:input={handleInput}
    on:keydown={handleKeydown}
    on:keyup={handleCursorMove}
    on:click={handleCursorMove}
    aria-label="Write a comment"
  ></textarea>
  <div class="footer">
    <span class="hint">Use @ to mention someone</span>
    <button type="button" class="post-btn" on:click={submit} disabled={sending || !body.trim()}>
      {sending ? 'Posting…' : parentId ? 'Reply' : 'Post'}
    </button>
  </div>
  <MentionAutocomplete
    open={mentionOpen || mentionLoading}
    position={mentionPosition}
    items={mentionItems}
    active={mentionActive}
    loading={mentionLoading}
    query={mentionQuery}
    on:select={(event) => insertMention(event.detail)}
  />
</div>

<style>
  .comment-composer {
    position: relative;
    display: grid;
    gap: 6px;
  }

  textarea {
    resize: none;
    min-height: 52px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    font: inherit;
    line-height: 1.35;
    transition: border-color 0.15s ease;
  }

  textarea:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.2);
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
    padding: 5px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.12);
    color: inherit;
    cursor: pointer;
    font-size: 0.82rem;
    transition: opacity 0.15s ease;
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
