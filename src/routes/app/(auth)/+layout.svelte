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

  .auth-shell::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 10%, rgba(0, 0, 0, 0.45), transparent 55%),
      radial-gradient(circle at 50% 90%, rgba(0, 0, 0, 0.45), transparent 60%),
      linear-gradient(180deg, rgba(2, 4, 11, 0.4), rgba(1, 4, 12, 0.8));
    mix-blend-mode: multiply;
    pointer-events: none;
    z-index: 2;
  }

  .auth-shell__slot {
    position: relative;
    width: min(520px, 100%);
    z-index: 3;
  }
</style>
