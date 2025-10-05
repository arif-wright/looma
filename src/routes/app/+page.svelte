<script lang="ts">
  export let data;

  const email = data?.user?.email ?? data?.session?.user?.email ?? '';
</script>

<svelte:head>
  <title>Looma App</title>
</svelte:head>

<section class="dashboard">
  <h1>
    Welcome back{#if email}, {email}{/if}
  </h1>

  <div class="cards">
    <article class="card">
      <h2>Session Snapshot</h2>
      <p>The `/app` area is protected by a server-side guard.</p>
      <ul>
        <li>Route guard: `src/routes/app/+layout.server.ts`</li>
        <li>Logout action: `src/routes/app/+layout.server.ts`</li>
        <li>Session context: `src/routes/+layout.server.ts`</li>
      </ul>
    </article>

    <article class="card">
      <h2>Next Up</h2>
      <ol>
        <li>Marketing homepage</li>
        <li>Profile display</li>
        <li>Creatures model & API</li>
      </ol>
    </article>
  </div>
</section>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .cards {
    display: grid;
    gap: 1.5rem;
  }

  .card {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.25rem;
    background: #ffffff;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 600;
  }

  h2 {
    font-size: 1.25rem;
    margin-bottom: 0.75rem;
  }

  ul,
  ol {
    margin: 0;
    padding-left: 1.25rem;
  }

  p {
    margin-bottom: 0.75rem;
  }
</style>
