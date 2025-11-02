<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import {
    ShareError,
    shareAchievement,
    shareRun,
    type AchievementShareInput,
    type RunShareInput
  } from '$lib/social/share';

  const MAX_LENGTH = 280;

  type SubmittedDetail = { postId: string };

  export let kind: 'run' | 'achievement';
  export let defaults: { text?: string } | null = null;
  export let preview: Record<string, unknown> | null = null;
  export let run: RunShareInput | null = null;
  export let achievement: AchievementShareInput | null = null;

  const dispatch = createEventDispatcher<{ submitted: SubmittedDetail; cancel: void }>();

  let textareaEl: HTMLTextAreaElement | null = null;
  let text = (defaults?.text ?? '').slice(0, MAX_LENGTH);
  let submitting = false;
  let error: string | null = null;

  const characters = () => Array.from(text ?? '').length;
  const remaining = () => MAX_LENGTH - characters();

  onMount(() => {
    requestAnimationFrame(() => {
      textareaEl?.focus();
      textareaEl?.setSelectionRange(text.length, text.length);
    });
  });

  const updateText = (value: string) => {
    const next = value ?? '';
    const glyphs = Array.from(next);
    if (glyphs.length <= MAX_LENGTH) {
      text = next;
    } else {
      text = glyphs.slice(0, MAX_LENGTH).join('');
    }
  };

  const handleCancel = () => {
    if (submitting) return;
    dispatch('cancel');
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (submitting) return;

    const trimmed = text.trim();
    const caption = trimmed.length > 0 ? trimmed : undefined;

    try {
      submitting = true;
      error = null;

      if (kind === 'run') {
        if (!run) {
          throw new ShareError('Missing run context.', 400, 'missing_payload');
        }
        const result = await shareRun({ ...run, text: caption });
        dispatch('submitted', { postId: result.postId });
        return;
      }

      if (!achievement) {
        throw new ShareError('Missing achievement context.', 400, 'missing_payload');
      }

      const result = await shareAchievement({ ...achievement, text: caption });
      dispatch('submitted', { postId: result.postId });
    } catch (err) {
      console.error('[share-composer] submit failed', err);
      const shareError = err instanceof ShareError ? err : null;
      error = shareError?.message ?? 'Unable to share right now.';
    } finally {
      submitting = false;
    }
  };
</script>

<form
  class="share-composer"
  on:submit={handleSubmit}
  aria-labelledby="share-composer-title"
  data-testid="share-composer"
  data-kind={kind}
>
  <header class="share-header">
    <div>
      <h2 id="share-composer-title">{kind === 'run' ? 'Share your run?' : 'Share your new badge?'}</h2>
      {#if preview?.subtitle}
        <p class="share-subtitle">{String(preview.subtitle)}</p>
      {/if}
    </div>
    <button type="button" class="share-cancel" on:click={handleCancel} disabled={submitting}>
      Cancel
    </button>
  </header>

  {#if preview?.title || preview?.subtitle}
    <div class="share-preview" role="presentation">
      <div class="preview-copy">
        {#if preview?.title}
          <p class="preview-title">{String(preview.title)}</p>
        {/if}
        {#if preview?.subtitle}
          <p class="preview-subtitle">{String(preview.subtitle)}</p>
        {/if}
      </div>
    </div>
  {/if}

  <label class="sr-only" for="share-textarea">Add a caption</label>
  <textarea
    id="share-textarea"
    class="share-input input-glass"
    bind:this={textareaEl}
    bind:value={text}
    rows={3}
    maxlength={280}
    placeholder="Add a short note…"
    aria-describedby="share-counter"
    on:input={(event) => updateText((event.target as HTMLTextAreaElement).value)}
    disabled={submitting}
  ></textarea>

  <div class="share-footer">
    <span id="share-counter" class={`share-counter ${remaining() < 0 ? 'over' : ''}`}>
      {characters()}/{MAX_LENGTH}
    </span>
    <button type="submit" class="share-submit" disabled={submitting || remaining() < 0}>
      {submitting ? 'Sharing…' : 'Post'}
    </button>
  </div>

  {#if error}
    <p class="share-error" role="alert">{error}</p>
  {/if}
</form>

<style>
  .share-composer {
    display: grid;
    gap: 0.9rem;
    background: rgba(10, 16, 32, 0.82);
    border: 1px solid rgba(130, 200, 255, 0.16);
    border-radius: 1rem;
    padding: 1rem 1.1rem 1.1rem;
    color: rgba(236, 242, 255, 0.9);
    box-shadow: 0 22px 45px rgba(6, 10, 25, 0.45);
  }

  .share-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .share-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .share-subtitle {
    margin: 0.2rem 0 0 0;
    font-size: 0.9rem;
    color: rgba(200, 220, 255, 0.72);
  }

  .share-cancel {
    border: none;
    background: none;
    color: rgba(180, 210, 255, 0.75);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .share-cancel:hover,
  .share-cancel:focus-visible {
    color: rgba(220, 238, 255, 0.95);
    outline: none;
  }

  .share-preview {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.75rem 0.9rem;
    border-radius: 0.85rem;
    background: rgba(90, 120, 220, 0.15);
    border: 1px solid rgba(140, 190, 255, 0.22);
  }

.preview-copy {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

  .preview-title {
    margin: 0;
    font-weight: 600;
    font-size: 0.95rem;
  }

  .preview-subtitle {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(210, 224, 255, 0.7);
  }

  .share-input {
    width: 100%;
    min-height: 6rem;
    resize: vertical;
    font-size: 0.95rem;
    line-height: 1.4;
    color: inherit;
    background: rgba(12, 18, 36, 0.6);
    border-radius: 0.9rem;
    padding: 0.75rem 0.9rem;
    border: 1px solid rgba(140, 188, 252, 0.16);
  }

  .share-input:focus-visible {
    outline: none;
    border-color: rgba(180, 225, 255, 0.5);
    box-shadow: 0 0 0 2px rgba(110, 186, 255, 0.35);
  }

  .share-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .share-counter {
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    color: rgba(190, 210, 255, 0.65);
  }

  .share-counter.over {
    color: rgb(248 113 113);
  }

  .share-submit {
    border: none;
    border-radius: 999px;
    padding: 0.55rem 1.6rem;
    font-weight: 600;
    font-size: 0.9rem;
    background: linear-gradient(120deg, rgba(130, 102, 255, 0.88), rgba(65, 215, 255, 0.88));
    color: rgba(12, 15, 32, 0.92);
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .share-submit:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .share-submit:not(:disabled):hover,
  .share-submit:not(:disabled):focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 10px 28px rgba(70, 210, 255, 0.25);
    outline: none;
  }

  .share-error {
    margin: 0;
    font-size: 0.82rem;
    color: rgb(248 113 113);
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
