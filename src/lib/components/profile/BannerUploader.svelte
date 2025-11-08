<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { resizeImage } from '$lib/utils/image-resize';
  import { bust } from '$lib/utils/cachebust';

  const ACCEPT = 'image/png,image/jpeg,image/webp';
  const MAX_UPLOAD_SIZE = 4 * 1024 * 1024;

  export let url: string | null = null;
  export let editable = false;

  const dispatch = createEventDispatcher<{ changed: { url: string } }>();

  let preview = url;
  let uploading = false;
  let error: string | null = null;
  let fileInput: HTMLInputElement | null = null;
  let tempObjectUrl: string | null = null;

  $: preview = url;

  const cleanup = () => {
    if (tempObjectUrl) {
      URL.revokeObjectURL(tempObjectUrl);
      tempObjectUrl = null;
    }
  };

  onDestroy(cleanup);

  const reset = () => {
    if (fileInput) fileInput.value = '';
  };

  const handleFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    cleanup();
    if (file.size > MAX_UPLOAD_SIZE) {
      error = 'File must be 4MB or smaller.';
      reset();
      return;
    }
    uploading = true;
    error = null;
    tempObjectUrl = URL.createObjectURL(file);
    preview = tempObjectUrl;
    try {
      const blob = await resizeImage(file, { maxW: 1800, maxH: 600, type: 'image/webp', quality: 0.92 });
      const payloadFile = new File([blob], 'banner.webp', { type: blob.type });
      const formData = new FormData();
      formData.set('file', payloadFile);
      const res = await fetch('/app/profile/upload/banner', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Upload failed');
      }
      const data = await res.json();
      const busted = bust(data?.url);
      preview = busted;
      dispatch('changed', { url: busted });
    } catch (err) {
      console.error('banner upload failed', err);
      error = err instanceof Error ? err.message : 'Upload failed';
      preview = url;
    } finally {
      cleanup();
      uploading = false;
      reset();
    }
  };
</script>

<div class="banner-uploader" style={`background-image:url('${preview ?? ''}')`} data-testid="banner-uploader">
  {#if editable}
    <label class="upload-btn">
      <input
        bind:this={fileInput}
        type="file"
        accept={ACCEPT}
        capture="environment"
        data-testid="banner-input"
        on:change={handleFile}
      />
      <span>{uploading ? 'Uploading…' : 'Change banner'}</span>
    </label>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
  {/if}
</div>

<style>
  .banner-uploader {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 1;
    border-radius: 32px;
    background: linear-gradient(135deg, rgba(8, 12, 24, 0.95), rgba(18, 7, 32, 0.88));
    background-size: cover;
    background-position: center;
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .upload-btn {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    padding: 0.45rem 1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(4, 6, 18, 0.72);
    font-size: 0.82rem;
    cursor: pointer;
  }

  .upload-btn input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .error {
    position: absolute;
    left: 1rem;
    bottom: 0.5rem;
    margin: 0;
    font-size: 0.85rem;
    color: #fca5a5;
    background: rgba(4, 6, 18, 0.7);
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
  }

  @media (max-width: 640px) {
    .banner-uploader {
      border-radius: 20px;
    }
  }
</style>
