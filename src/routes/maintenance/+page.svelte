<script lang="ts">
  import { page } from '$app/stores';
  $: maintenanceMessage = $page.data.maintenance?.message ?? 'Thanks for your patience while we refresh systems.';
</script>

<svelte:head>
  <title>Looma · Maintenance</title>
</svelte:head>

<main class="maintenance">
  <div class="card">
    <p class="eyebrow">We will be right back</p>
    <h1>We are tuning the Looma field.</h1>
    <p>{maintenanceMessage}</p>
    <a href="/app/home">Try again</a>
  </div>
</main>

<style>
  .maintenance {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.5rem;
    background: radial-gradient(circle at top, rgba(56, 189, 248, 0.15), transparent), #020617;
  }

  .card {
    max-width: 480px;
    text-align: center;
    padding: 2.5rem;
    border-radius: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(15, 23, 42, 0.82);
    box-shadow: 0 25px 60px rgba(2, 6, 23, 0.65);
  }

  .eyebrow {
    font-size: 0.85rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
  }

  h1 {
    font-size: clamp(2rem, 4vw, 2.8rem);
    margin: 0.75rem 0 1rem;
  }

  p {
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.6;
    margin-bottom: 1.25rem;
  }

  a {
    display: inline-flex;
    justify-content: center;
    padding: 0.65rem 1.5rem;
    border-radius: 999px;
    background: linear-gradient(120deg, #34d399, #38bdf8);
    font-weight: 600;
    color: #0f172a;
  }
</style>
