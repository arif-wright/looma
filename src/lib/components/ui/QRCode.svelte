<script lang="ts">
  import { onMount } from 'svelte';

  export let value = '';
  export let size = 120;

  let canvas: HTMLCanvasElement | null = null;
  let rendered = false;

  onMount(async () => {
    if (!value) return;
    const mod = await import('qrcode');
    const QRCode = mod.default ?? mod;
    try {
      await QRCode.toCanvas(canvas, value, {
        width: size,
        margin: 0,
        color: {
          dark: '#ffffff',
          light: '#00000000'
        }
      });
      rendered = true;
    } catch (err) {
      console.error('qr render failed', err);
    }
  });
</script>

<canvas bind:this={canvas} width={size} height={size} class="qr-canvas" aria-hidden="true"></canvas>
{#if !rendered}
  <div class="qr-placeholder" style={`width:${size}px;height:${size}px`}></div>
{/if}

<style>
  .qr-canvas,
  .qr-placeholder {
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.03);
  }

  .qr-placeholder {
    border: 1px dashed rgba(255, 255, 255, 0.2);
  }
</style>
