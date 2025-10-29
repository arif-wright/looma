<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import MentionAutocomplete from '$lib/social/MentionAutocomplete.svelte';
  import type { MentionOption } from '$lib/social/types';

  export let parentId: string | null = null;
  export let autofocus = false;
  export let placeholder = parentId ? 'Write a reply…' : 'Share your thoughts…';
  export let submitLabel = parentId ? 'Reply' : 'Post';
  export let testId = 'reply-composer';

  const dispatch = createEventDispatcher<{ cancel: void }>();

  let textareaEl: HTMLTextAreaElement | null = null;
  let mirrorEl: HTMLDivElement | null = null;
  let text = '';

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
  const FETCH_DELAY = 160;
  const MAX_LENGTH = 500;
  const MAX_LINES = 6;

  function ensureMirror() {
    if (mirrorEl || typeof document === 'undefined') return;
    mirrorEl = document.createElement('div');
    mirrorEl.className = 'textarea-mirror';
    mirrorEl.style.position = 'absolute';
    mirrorEl.style.visibility = 'hidden';
    mirrorEl.style.pointerEvents = 'none';
    mirrorEl.style.whiteSpace = 'pre-wrap';
    mirrorEl.style.wordWrap = 'break-word';
    mirrorEl.style.top = '0';
    mirrorEl.style.left = '-9999px';
    document.body.appendChild(mirrorEl);
  }

  function syncMirrorStyles() {
    if (!textareaEl || !mirrorEl || typeof window === 'undefined') return;
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

  function getCaretRect(position: number): DOMRect | null {
    if (!textareaEl) return null;
    ensureMirror();
    if (!mirrorEl) return null;
    syncMirrorStyles();
    const textareaRect = textareaEl.getBoundingClientRect();
    mirrorEl.style.top = `${textareaRect.top}px`;
    mirrorEl.style.left = `${textareaRect.left}px`;
    mirrorEl.style.width = `${textareaRect.width}px`;
    mirrorEl.textContent = textareaEl.value.slice(0, position);
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirrorEl.appendChild(marker);
    const range = document.createRange();
    range.selectNode(marker);
    const rect = range.getClientRects()[0] ?? null;
    mirrorEl.removeChild(marker);
    return rect ?? null;
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
    if (typeof window === 'undefined') return;
    if (!mentionOpen || !textareaEl) return;
    const caretIndex = textareaEl.selectionStart ?? textareaEl.value.length;
    const rect = getCaretRect(caretIndex);
    if (!rect) return;
    mentionPosition = {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX
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
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        mentionItems = rows.map((item: any) => ({
          id: item.id,
          author_handle: item.author_handle ?? item.handle ?? null,
          author_display_name: item.author_display_name ?? item.display_name ?? null,
          author_avatar_url: item.author_avatar_url ?? item.avatar_url ?? null
        }));
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
        tick().then(updateMentionPosition);
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
    updateMentionState();
  }

  function handleCaretMove() {
    updateMentionState();
    tick().then(updateMentionPosition);
  }

  function insertMention(option: MentionOption | undefined) {
    if (!option?.author_handle || !textareaEl || mentionStart === null) return;
    const handle = option.author_handle.toLowerCase();
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

  function handleMentionSelect(event: CustomEvent<MentionOption>) {
    insertMention(event.detail);
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
        event.stopPropagation();
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget instanceof HTMLTextAreaElement && event.currentTarget.form?.requestSubmit();
      return;
    }

    if (event.key === 'Escape') {
      dispatch('cancel');
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

  export function focus() {
    textareaEl?.focus();
  }
</script>

<form method="post" action="?/reply" class="reply-composer" data-testid={testId}>
  {#if parentId}
    <input type="hidden" name="parentId" value={parentId} />
  {/if}
  <textarea
    bind:this={textareaEl}
    bind:value={text}
    class="reply-input"
    name="body"
    required
    rows="3"
    maxlength={MAX_LENGTH}
    placeholder={placeholder}
    on:input={handleInput}
    on:keydown={handleKeydown}
    on:keyup={handleCaretMove}
    on:click={handleCaretMove}
    aria-label={parentId ? 'Write a reply' : 'Write a comment'}
  ></textarea>
  <div class="reply-footer">
    <span class="hint">Use @ to mention someone</span>
    <button type="submit" class="submit-btn" disabled={!text.trim()}>{submitLabel}</button>
  </div>
  <MentionAutocomplete
    open={mentionOpen}
    loading={mentionLoading}
    items={mentionItems}
    active={mentionActive}
    position={mentionPosition}
    query={mentionQuery}
    on:select={handleMentionSelect}
  />
</form>

<style>
  .reply-composer {
    display: grid;
    gap: 8px;
  }

  .reply-input {
    resize: vertical;
    min-height: 64px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.85);
    color: #e2e8f0;
    font: inherit;
    transition: border-color 0.16s ease, box-shadow 0.16s ease;
  }

  .reply-input:focus {
    outline: none;
    border-color: rgba(16, 185, 129, 0.6);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.18);
  }

  .reply-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .hint {
    opacity: 0.8;
  }

  .submit-btn {
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    background: rgba(16, 185, 129, 0.92);
    color: #041316;
    transition: background 0.16s ease;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submit-btn:not(:disabled):hover,
  .submit-btn:not(:disabled):focus-visible {
    background: rgba(52, 211, 153, 0.95);
  }

  @media (max-width: 640px) {
    .reply-input {
      min-height: 56px;
    }
  }
</style>
