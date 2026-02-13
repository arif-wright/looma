<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher } from 'svelte';

  type MessageAttachmentInput = {
    kind?: 'image' | 'gif' | 'file' | 'link';
    storagePath?: string;
    url?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
    altText?: string | null;
  };

  export let conversationId: string | null = null;
  export let disabled = false;
  export let sending = false;
  export let editing = false;
  export let editSeed = '';

  const dispatch = createEventDispatcher<{
    send: { body: string; attachments?: MessageAttachmentInput[] };
    typing: { typing: boolean };
    cancelEdit: void;
  }>();

  type PendingAttachment = {
    id: string;
    kind: 'image' | 'gif';
    storagePath?: string;
    url?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
    previewUrl: string;
  };

  type GifResult = {
    id: string;
    url: string;
    previewUrl: string;
    width: number | null;
    height: number | null;
  };

  const PICKER_EMOJIS = ['😀', '😂', '😍', '🥹', '😭', '🔥', '🙏', '❤️', '👍', '🎉', '😮', '😢'];

  let body = '';
  let lastSeed = '';
  let inputRef: HTMLTextAreaElement | null = null;
  let fileInputRef: HTMLInputElement | null = null;

  let showEmojiPicker = false;
  let showGifPicker = false;
  let gifQuery = '';
  let gifLoading = false;
  let gifError: string | null = null;
  let gifDisabled = false;
  let gifResults: GifResult[] = [];

  let uploading = false;
  let attachmentError: string | null = null;
  let pendingAttachments: PendingAttachment[] = [];
  let reduceMotion = false;

  if (browser) {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  $: if (editing && editSeed !== lastSeed) {
    body = editSeed;
    lastSeed = editSeed;
  }

  $: if (!editing && lastSeed !== '') {
    lastSeed = '';
  }

  const resetDraftState = () => {
    body = '';
    pendingAttachments = [];
    showEmojiPicker = false;
    showGifPicker = false;
    gifQuery = '';
    gifResults = [];
    gifError = null;
    dispatch('typing', { typing: false });
  };

  const toAttachmentPayload = (): MessageAttachmentInput[] =>
    pendingAttachments.map((item) => ({
      kind: item.kind,
      ...(item.storagePath ? { storagePath: item.storagePath } : {}),
      ...(item.url ? { url: item.url } : {}),
      ...(item.mimeType ? { mimeType: item.mimeType } : {}),
      ...(typeof item.bytes === 'number' ? { bytes: item.bytes } : {}),
      ...(typeof item.width === 'number' ? { width: item.width } : {}),
      ...(typeof item.height === 'number' ? { height: item.height } : {})
    }));

  const submit = () => {
    const trimmed = body.trim();
    if ((trimmed.length === 0 && pendingAttachments.length === 0) || disabled || sending || uploading) return;
    if (pendingAttachments.length) {
      dispatch('send', {
        body: trimmed,
        attachments: toAttachmentPayload()
      });
    } else {
      dispatch('send', { body: trimmed });
    }
    resetDraftState();
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }

    if (event.key === 'Escape') {
      showEmojiPicker = false;
      showGifPicker = false;
    }
  };

  const onInput = () => {
    dispatch('typing', { typing: body.trim().length > 0 });
  };

  const onBlur = () => {
    dispatch('typing', { typing: false });
  };

  const insertEmoji = (emoji: string) => {
    if (!inputRef) {
      body = `${body}${emoji}`;
      return;
    }

    const start = inputRef.selectionStart ?? body.length;
    const end = inputRef.selectionEnd ?? body.length;
    body = `${body.slice(0, start)}${emoji}${body.slice(end)}`;
    const cursor = start + emoji.length;

    queueMicrotask(() => {
      inputRef?.focus();
      inputRef?.setSelectionRange(cursor, cursor);
    });

    dispatch('typing', { typing: body.trim().length > 0 });
  };

  const loadImageDimensions = (file: File): Promise<{ width: number | null; height: number | null }> =>
    new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width || null, height: img.height || null });
        URL.revokeObjectURL(objectUrl);
      };
      img.onerror = () => {
        resolve({ width: null, height: null });
        URL.revokeObjectURL(objectUrl);
      };
      img.src = objectUrl;
    });

  const onPickFiles = async (event: Event) => {
    const target = event.currentTarget as HTMLInputElement | null;
    const files = target?.files ? Array.from(target.files) : [];
    if (!conversationId || !files.length || disabled) return;

    uploading = true;
    attachmentError = null;

    try {
      const metadata = files.map((file) => ({
        name: file.name,
        mimeType: file.type,
        bytes: file.size
      }));

      const prepareRes = await fetch('/api/messenger/upload/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId, files: metadata })
      });
      const preparePayload = await prepareRes.json().catch(() => ({}));

      if (!prepareRes.ok || !Array.isArray(preparePayload?.uploads)) {
        throw new Error(
          typeof preparePayload?.message === 'string' ? preparePayload.message : 'Could not prepare uploads.'
        );
      }

      const uploads = preparePayload.uploads as Array<{
        uploadUrl: string;
        storagePath: string;
        viewUrl: string | null;
        mimeType: string;
        bytes: number;
        kind: 'image' | 'gif';
      }>;

      const nextItems: PendingAttachment[] = [];
      for (let i = 0; i < uploads.length; i += 1) {
        const upload = uploads[i];
        const file = files[i];
        if (!file || !upload?.uploadUrl || !upload?.storagePath) continue;

        const putRes = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: {
            'content-type': file.type || upload.mimeType
          },
          body: file
        });

        if (!putRes.ok) {
          throw new Error('Upload failed. Please try again.');
        }

        const dims = await loadImageDimensions(file);
        nextItems.push({
          id: crypto.randomUUID(),
          kind: upload.kind,
          ...(upload.storagePath ? { storagePath: upload.storagePath } : {}),
          ...(upload.mimeType ? { mimeType: upload.mimeType } : {}),
          ...(typeof upload.bytes === 'number' ? { bytes: upload.bytes } : {}),
          ...(typeof dims.width === 'number' ? { width: dims.width } : {}),
          ...(typeof dims.height === 'number' ? { height: dims.height } : {}),
          previewUrl: upload.viewUrl ?? URL.createObjectURL(file)
        });
      }

      pendingAttachments = [...pendingAttachments, ...nextItems].slice(0, 4);
    } catch (err) {
      attachmentError = err instanceof Error ? err.message : 'Upload failed.';
    } finally {
      uploading = false;
      if (fileInputRef) {
        fileInputRef.value = '';
      }
    }
  };

  const removeAttachment = (id: string) => {
    pendingAttachments = pendingAttachments.filter((item) => item.id !== id);
  };

  const searchGif = async () => {
    if (gifQuery.trim().length < 2 || disabled) return;
    gifLoading = true;
    gifError = null;

    try {
      const res = await fetch('/api/messenger/gif/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: gifQuery.trim(), limit: 20 })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'GIF search unavailable.');
      }
      gifDisabled = payload?.disabled === true;
      gifResults = Array.isArray(payload?.results) ? (payload.results as GifResult[]) : [];
      if (gifDisabled) {
        gifError = 'GIF search is disabled on this environment.';
      }
    } catch (err) {
      gifError = err instanceof Error ? err.message : 'GIF search unavailable.';
    } finally {
      gifLoading = false;
    }
  };

  const selectGif = (gif: GifResult) => {
    pendingAttachments = [
      ...pendingAttachments,
      {
        id: crypto.randomUUID(),
        kind: 'gif' as const,
        ...(gif.url ? { url: gif.url } : {}),
        mimeType: 'image/gif',
        ...(typeof gif.width === 'number' ? { width: gif.width } : {}),
        ...(typeof gif.height === 'number' ? { height: gif.height } : {}),
        previewUrl: gif.previewUrl || gif.url
      }
    ].slice(0, 4);
    showGifPicker = false;
  };
</script>

<div class="composer">
  <label class="sr-only" for="message-input">Message</label>
  <div class="input-wrap">
    {#if editing}
      <div class="edit-row" role="status">
        <span>Editing message</span>
        <button type="button" class="cancel" on:click={() => dispatch('cancelEdit')}>Cancel</button>
      </div>
    {/if}

    <div class="toolbar" role="group" aria-label="Composer tools">
      <button type="button" class="tool" on:click={() => (showEmojiPicker = !showEmojiPicker)} aria-expanded={showEmojiPicker}>😊</button>
      <button type="button" class="tool" on:click={() => fileInputRef?.click()} disabled={uploading || disabled}>📷</button>
      <button type="button" class="tool" on:click={() => (showGifPicker = !showGifPicker)} disabled={disabled}>GIF</button>
      <input
        class="hidden-input"
        bind:this={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        on:change={onPickFiles}
      />
    </div>

    {#if showEmojiPicker}
      <div class="emoji-picker" role="dialog" aria-label="Emoji picker">
        {#each PICKER_EMOJIS as emoji}
          <button type="button" on:click={() => insertEmoji(emoji)}>{emoji}</button>
        {/each}
      </div>
    {/if}

    {#if showGifPicker}
      <div class="gif-picker" role="dialog" aria-label="GIF picker">
        <div class="gif-search-row">
          <input type="text" bind:value={gifQuery} placeholder="Search GIFs" on:keydown={(event) => event.key === 'Enter' && searchGif()} />
          <button type="button" on:click={searchGif} disabled={gifLoading || gifQuery.trim().length < 2}>Search</button>
        </div>

        {#if gifError}
          <p class="inline-error">{gifError}</p>
        {/if}

        {#if gifLoading}
          <p class="gif-state">Searching…</p>
        {:else if gifResults.length > 0}
          <div class="gif-grid">
            {#each gifResults as gif (gif.id)}
              <button type="button" class="gif-item" on:click={() => selectGif(gif)}>
                <img src={(reduceMotion ? gif.previewUrl : gif.url) || gif.previewUrl} alt="GIF result" loading="lazy" />
              </button>
            {/each}
          </div>
        {:else if !gifDisabled}
          <p class="gif-state">Search for a GIF to attach.</p>
        {/if}
      </div>
    {/if}

    {#if pendingAttachments.length > 0}
      <div class="attachment-preview" role="list" aria-label="Pending attachments">
        {#each pendingAttachments as item (item.id)}
          <div class="attachment-chip" role="listitem">
            <img src={item.previewUrl} alt="Pending attachment" loading="lazy" />
            <button type="button" on:click={() => removeAttachment(item.id)} aria-label="Remove attachment">✕</button>
          </div>
        {/each}
      </div>
    {/if}

    {#if attachmentError}
      <p class="inline-error" role="status">{attachmentError}</p>
    {/if}

    <textarea
      bind:this={inputRef}
      id="message-input"
      rows="2"
      placeholder={disabled ? 'Messaging unavailable.' : editing ? 'Edit message...' : 'Write a message...'}
      bind:value={body}
      {disabled}
      on:keydown={onKeydown}
      on:input={onInput}
      on:blur={onBlur}
    ></textarea>
  </div>
  <button
    type="button"
    on:click={submit}
    disabled={disabled || sending || uploading || (body.trim().length === 0 && pendingAttachments.length === 0)}
  >
    {#if uploading}
      Uploading...
    {:else if sending}
      {editing ? 'Saving...' : 'Sending...'}
    {:else}
      {editing ? 'Save' : 'Send'}
    {/if}
  </button>
</div>

<style>
  .composer {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.6rem;
    padding: 0.85rem;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.46);
  }

  .input-wrap {
    display: grid;
    gap: 0.4rem;
  }

  .toolbar {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }

  .tool {
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 0.55rem;
    background: rgba(15, 23, 42, 0.62);
    color: #e2e8f0;
    padding: 0.28rem 0.5rem;
    cursor: pointer;
  }

  .hidden-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .emoji-picker {
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 0.72rem;
    background: rgba(2, 6, 23, 0.94);
    padding: 0.4rem;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.25rem;
  }

  .emoji-picker button {
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.6);
    border-radius: 0.5rem;
    font-size: 1.1rem;
    padding: 0.25rem;
    cursor: pointer;
  }

  .gif-picker {
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 0.72rem;
    background: rgba(2, 6, 23, 0.94);
    padding: 0.5rem;
    display: grid;
    gap: 0.45rem;
  }

  .gif-search-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.4rem;
  }

  .gif-search-row input {
    border-radius: 0.6rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.72);
    color: #e2e8f0;
    padding: 0.44rem 0.6rem;
  }

  .gif-search-row button {
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 0.6rem;
    background: rgba(15, 23, 42, 0.66);
    color: #e2e8f0;
    padding: 0 0.65rem;
  }

  .gif-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
    max-height: 14rem;
    overflow: auto;
  }

  .gif-item {
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 0.55rem;
    overflow: hidden;
    background: rgba(15, 23, 42, 0.6);
    padding: 0;
    cursor: pointer;
  }

  .gif-item img {
    width: 100%;
    display: block;
    max-height: 7.5rem;
    object-fit: cover;
  }

  .gif-state {
    margin: 0;
    color: rgba(148, 163, 184, 0.95);
    font-size: 0.82rem;
  }

  .attachment-preview {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .attachment-chip {
    position: relative;
    width: 4.6rem;
    height: 4.6rem;
    border-radius: 0.55rem;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(2, 6, 23, 0.6);
  }

  .attachment-chip img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .attachment-chip button {
    position: absolute;
    top: 0.2rem;
    right: 0.2rem;
    border: none;
    border-radius: 999px;
    width: 1.35rem;
    height: 1.35rem;
    background: rgba(2, 6, 23, 0.82);
    color: #f8fafc;
    cursor: pointer;
  }

  .inline-error {
    margin: 0;
    color: #fda4af;
    font-size: 0.78rem;
  }

  .edit-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: rgba(186, 230, 253, 0.94);
  }

  .cancel {
    border: none;
    background: transparent;
    color: rgba(125, 211, 252, 0.92);
    cursor: pointer;
    padding: 0;
    font-size: 0.75rem;
  }

  textarea {
    width: 100%;
    resize: none;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.72);
    color: #e2e8f0;
    padding: 0.7rem 0.8rem;
  }

  button {
    border: none;
    border-radius: 0.75rem;
    background: #22d3ee;
    color: #083344;
    padding: 0 1rem;
    font-weight: 700;
    cursor: pointer;
  }

  button[disabled] {
    opacity: 0.55;
    cursor: default;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
