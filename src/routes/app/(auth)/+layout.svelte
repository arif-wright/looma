<script lang="ts">
  import AuthBackdrop from '$lib/ui/AuthBackdrop.svelte';
</script>

<section class="auth-shell">
  <AuthBackdrop />
  <div class="auth-shell__slot">
    <slot />
  </div>
</section>

<style>
  :global(body) {
    background: #05060d;
  }

  .auth-shell {
    position: relative;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: clamp(2.5rem, 5vw, 3.5rem) clamp(1.25rem, 3vw, 1.75rem);
    overflow: hidden;
  }

  .auth-shell__slot {
    position: relative;
    width: min(520px, 100%);
    z-index: 3;
  }
</style>
