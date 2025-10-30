<script lang="ts">
  import AuthBackdrop from '$lib/ui/AuthBackdrop.svelte';
</script>

<section class="auth-shell">
  <AuthBackdrop />
  <div class="auth-container">
    <slot />
  </div>
</section>

<style>
  .auth-shell {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3.5rem 1.5rem;
    background: #05060d;
    overflow: hidden;
  }

  .auth-container {
    position: relative;
    width: min(520px, 100%);
    z-index: 3;
  }

  @media (max-width: 640px) {
    .auth-shell {
      padding: 2.5rem 1.25rem 3rem;
    }
  }
</style>
