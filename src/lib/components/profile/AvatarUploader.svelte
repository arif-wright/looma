<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { resizeImage } from '$lib/utils/image-resize';
  import { bust } from '$lib/utils/cachebust';
  import { currentProfile } from '$lib/stores/profile';

  const ACCEPT = 'image/png,image/jpeg,image/webp';
  const MAX_UPLOAD_SIZE = 2 * 1024 * 1024;

  export let url: string | null = null;
  export let editable = false;

  const dispatch = createEventDispatcher<{ changed: { url: string } }>();

  let preview = url;
  let uploading = false;
  let error: string | null = null;
  let fileInput: HTMLInputElement | null = null;
  let tempObjectUrl: string | null = null;

  $: preview = url;

  const resetInput = () => {
    if (fileInput) fileInput.value = '';
  };

  const cleanupTempUrl = () => {
    if (tempObjectUrl) {
      URL.revokeObjectURL(tempObjectUrl);
      tempObjectUrl = null;
    }
  };

  onDestroy(() => {
    cleanupTempUrl();
  });

  const handleFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    cleanupTempUrl();
    if (file.size > MAX_UPLOAD_SIZE) {
      error = 'File must be 2MB or smaller.';
      resetInput();
      return;
    }
    uploading = true;
    error = null;
    tempObjectUrl = URL.createObjectURL(file);
    preview = tempObjectUrl;
    try {
      const blob = await resizeImage(file, { maxW: 512, maxH: 512, type: 'image/webp', quality: 0.9 });
      const payloadFile = new File([blob], 'avatar.webp', { type: blob.type });
      const formData = new FormData();
      formData.set('file', payloadFile);
      const res = await fetch('/app/profile/upload/avatar', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Upload failed');
      }
      const data = await res.json();
      const busted = bust(data?.url);
      preview = busted;
      dispatch('changed', { url: busted });
      currentProfile.update((profile) => (profile ? { ...profile, avatar_url: busted } : profile));
    } catch (err) {
      console.error('avatar upload failed', err);
      error = err instanceof Error ? err.message : 'Upload failed';
      preview = url;
    } finally {
      cleanupTempUrl();
      uploading = false;
      resetInput();
    }
  };
</script>

<div class="avatar-uploader" data-editable={editable} data-testid="avatar-uploader">
  <img data-testid="avatar-preview" src={preview ?? '/avatar.svg'} alt="Profile avatar" />
  {#if editable}
    <label class="upload-btn">
      <input
        bind:this={fileInput}
        type="file"
        accept={ACCEPT}
        capture="environment"
        data-testid="avatar-input"
        on:change={handleFile}
      />
      <span>{uploading ? 'Uploading…' : 'Change avatar'}</span>
    </label>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
  {/if}
</div>

<style>
  .avatar-uploader {
    position: relative;
    width: 140px;
    height: 140px;
  }

  .avatar-uploader img {
    width: 100%;
    height: 100%;
    border-radius: 32px;
    border: 2px solid rgba(94, 242, 255, 0.45);
    object-fit: cover;
    box-shadow: 0 20px 40px rgba(5, 6, 18, 0.55);
    background: radial-gradient(circle at 30% 30%, rgba(94, 242, 255, 0.3), transparent 60%);
  }

  .upload-btn {
    position: absolute;
    bottom: -0.5rem;
    right: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(4, 6, 18, 0.72);
    font-size: 0.78rem;
    cursor: pointer;
  }

  .upload-btn input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .error {
    margin: 0.4rem 0 0;
    font-size: 0.8rem;
    color: #fca5a5;
  }

  @media (max-width: 640px) {
    .avatar-uploader {
      width: 110px;
      height: 110px;
    }
  }
</style>
