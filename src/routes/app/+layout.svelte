<script lang="ts">
  export let data;

  const userEmail = data?.user?.email ?? data?.session?.user?.email ?? '';
</script>

<header class="app-header">
  <div class="app-meta">
    <span class="app-title">Looma</span>
    {#if userEmail}
      <span class="app-user">{userEmail}</span>
    {/if}
  </div>

  <nav class="app-nav">
    <a href="/app" class="nav-link">Home</a>
    <a href="/app/creatures" class="nav-link">Creatures</a>
    <span class="nav-link disabled" aria-disabled="true" tabindex="-1">Inventory</span>
  </nav>

  <form method="POST" action="/app?/logout">
    <button type="submit">Logout</button>
  </form>
</header>

<main class="app-main">
  <slot />
</main>

<style>
  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .app-meta {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }

  .app-nav {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .nav-link {
    color: #1f2937;
    text-decoration: none;
    font-weight: 500;
  }

  .nav-link:hover,
  .nav-link:focus {
    text-decoration: underline;
  }

  .nav-link.disabled {
    color: #9ca3af;
    text-decoration: none;
    cursor: not-allowed;
  }

  .app-title {
    font-weight: 600;
  }

  .app-user {
    font-size: 0.9rem;
    color: #4b5563;
  }

  .app-main {
    padding: 1.5rem;
  }

  button {
    background: #111827;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    cursor: pointer;
  }

  button:hover {
    background: #0f172a;
  }
</style>
