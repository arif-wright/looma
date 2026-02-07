<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;

  let selected = new Set<string>();
  let selectedList: string[] = [];

  const toggleSelection = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    selected = next;
  };

  const clearSelection = () => {
    selected = new Set();
  };

  const handleBulkSubmit = () => {
    selectedList = Array.from(selected);
  };

  $: selectedList = Array.from(selected);
</script>

<section class="roles-shell">
  <header class="roles-header">
    <div>
      <p class="eyebrow">Permissions</p>
      <h1>Roles &amp; Access</h1>
    </div>
    <form method="GET" class="search-form">
      <input type="text" name="q" placeholder="Search by handle or email" value={data.search} />
      <button type="submit">Search</button>
    </form>
  </header>

  <div class="roles-panel">
    <div class="roles-toolbar">
      <p>{selected.size} selected</p>
      <form method="POST" class="bulk-form">
        {#each selectedList as id}
          <input type="hidden" name="ids" value={id} />
        {/each}
        <div class="bulk-actions">
          <button type="submit" formaction="?/assign" name="role" value="admin" on:click={handleBulkSubmit}>Grant Admin</button>
          <button type="submit" formaction="?/assign" name="role" value="finance" on:click={handleBulkSubmit}>Grant Finance</button>
          <button type="submit" formaction="?/revoke" name="role" value="admin" on:click={handleBulkSubmit}>Revoke Admin</button>
          <button type="submit" formaction="?/revoke" name="role" value="finance" on:click={handleBulkSubmit}>Revoke Finance</button>
          <button type="button" on:click={clearSelection}>Clear</button>
        </div>
        {#if data.canManageSuper}
          <div class="bulk-actions">
            <button type="submit" formaction="?/assign" name="role" value="super" class="super" on:click={handleBulkSubmit}>Grant Super</button>
            <button type="submit" formaction="?/revoke" name="role" value="super" class="super" on:click={handleBulkSubmit}>Revoke Super</button>
          </div>
        {/if}
      </form>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th><span class="sr-only">Select</span></th>
            <th>User</th>
            <th>Email</th>
            <th>Admin</th>
            <th>Finance</th>
            {#if data.canManageSuper}
              <th>Super</th>
            {/if}
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {#if data.users.length === 0}
            <tr>
              <td colspan={data.canManageSuper ? 7 : 6} class="empty">No users found.</td>
            </tr>
          {:else}
            {#each data.users as user}
              <tr>
                <td>
                  <input type="checkbox" checked={selected.has(user.id)} on:change={(event) => toggleSelection(user.id, event.currentTarget.checked)}>
                </td>
                <td>
                  <div class="user-cell">
                    {#if user.avatar_url}
                      <img src={user.avatar_url} alt="" />
                    {/if}
                    <div>
                      <p>{user.display_name ?? user.handle ?? 'Unknown'}</p>
                      <p class="handle">@{user.handle ?? 'unknown'}</p>
                    </div>
                  </div>
                </td>
                <td>{user.email ?? '—'}</td>
                <td>
                  <form method="POST" action={`?/${user.roles.is_admin ? 'revoke' : 'assign'}`}>
                    <input type="hidden" name="role" value="admin">
                    <input type="hidden" name="ids" value={user.id}>
                    <label class="toggle">
                      <input type="checkbox" checked={user.roles.is_admin} on:change={(event) => event.currentTarget.form?.submit()}>
                      <span>{user.roles.is_admin ? 'On' : 'Off'}</span>
                    </label>
                  </form>
                </td>
                <td>
                  <form method="POST" action={`?/${user.roles.is_finance ? 'revoke' : 'assign'}`}>
                    <input type="hidden" name="role" value="finance">
                    <input type="hidden" name="ids" value={user.id}>
                    <label class="toggle">
                      <input type="checkbox" checked={user.roles.is_finance} on:change={(event) => event.currentTarget.form?.submit()}>
                      <span>{user.roles.is_finance ? 'On' : 'Off'}</span>
                    </label>
                  </form>
                </td>
                {#if data.canManageSuper}
                  <td>
                    <form method="POST" action={`?/${user.roles.is_super ? 'revoke' : 'assign'}`}>
                      <input type="hidden" name="role" value="super">
                      <input type="hidden" name="ids" value={user.id}>
                      <label class="toggle">
                        <input type="checkbox" checked={user.roles.is_super} on:change={(event) => event.currentTarget.form?.submit()}>
                        <span>{user.roles.is_super ? 'On' : 'Off'}</span>
                      </label>
                    </form>
                  </td>
                {/if}
                <td>{user.updated_at ? new Date(user.updated_at).toLocaleDateString() : '—'}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <span>Page {data.page} of {data.totalPages}</span>
      <div>
        {#if data.page > 1}
          <a href={`?page=${data.page - 1}&q=${data.search}`}>Previous</a>
        {/if}
        {#if data.page < data.totalPages}
          <a href={`?page=${data.page + 1}&q=${data.search}`}>Next</a>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .roles-shell {
    padding: 2rem clamp(1rem, 5vw, 3rem);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .roles-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
    position: sticky;
    top: 1rem;
    z-index: 5;
  }

  .roles-header h1 {
    font-size: clamp(2rem, 3vw, 2.5rem);
    margin: 0;
  }

  .eyebrow {
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 0.2rem;
  }

  .search-form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .search-form input {
    height: 3rem;
    min-width: 15.5rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 0.55rem 1rem;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font-size: 0.95rem;
    line-height: 1.2;
  }

  .search-form button {
    height: 3rem;
    flex: 0 0 auto;
    border-radius: 999px;
    padding: 0.55rem 1.2rem;
    background: linear-gradient(120deg, #38bdf8, #a855f7);
    border: none;
    font-weight: 600;
    font-size: 0.95rem;
    line-height: 1;
  }

  .roles-panel {
    border-radius: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(10, 15, 28, 0.78);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 30px 45px rgba(2, 6, 23, 0.55);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .roles-toolbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
  }

  .bulk-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .bulk-actions button {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    padding: 0.5rem 0.9rem;
  }

  .bulk-actions button.super {
    border-color: #f97316;
    color: #fcd34d;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  th,
  td {
    padding: 0.55rem;
    text-align: left;
  }

  th {
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.55);
  }

  tbody tr + tr td {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .user-cell {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .user-cell img {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    object-fit: cover;
  }

  .handle {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .toggle input {
    accent-color: #38bdf8;
  }

  .pagination {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.9rem;
  }

  .pagination a {
    margin-left: 0.75rem;
    text-decoration: underline;
  }

  .empty {
    text-align: center;
    padding: 1.5rem 0;
  }

  @media (max-width: 900px) {
    .roles-header {
      align-items: stretch;
    }

    .search-form {
      width: 100%;
    }

    .search-form input {
      min-width: 0;
      flex: 1;
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>
