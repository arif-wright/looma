<script lang="ts">
  export let data: {
    forbidden: boolean;
    items: any[];
    imageOptions: string[];
    loadError?: string | null;
  };

  type ShopItem = {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    type: string;
    rarity: string;
    price_shards: number;
    image_url: string;
    tags: string[] | null;
    sort: number | null;
    active: boolean;
    stackable: boolean;
  };

  type EditableItem = {
    id: string;
    slug: string;
    title: string;
    subtitle: string;
    description: string;
    type: string;
    rarity: string;
    price_shards: string;
    image_url: string;
    tagsText: string;
    sort: string;
    active: boolean;
    stackable: boolean;
  };

  const typeOptions = ['cosmetic', 'boost', 'bundle', 'token', 'other'];
  const rarityOptions = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

  const cloneItem = (item: ShopItem): ShopItem => ({
    ...item,
    tags: Array.isArray(item.tags) ? [...item.tags] : []
  });

  const toEditable = (item?: ShopItem): EditableItem => {
    if (!item) {
      return {
        id: '',
        slug: '',
        title: '',
        subtitle: '',
        description: '',
        type: 'other',
        rarity: 'common',
        price_shards: '0',
        image_url: '',
        tagsText: '',
        sort: '100',
        active: true,
        stackable: true
      };
    }

    return {
      id: item.id,
      slug: item.slug ?? '',
      title: item.title ?? '',
      subtitle: item.subtitle ?? '',
      description: item.description ?? '',
      type: item.type ?? 'other',
      rarity: item.rarity ?? 'common',
      price_shards: String(item.price_shards ?? 0),
      image_url: item.image_url ?? '',
      tagsText: Array.isArray(item.tags) ? item.tags.join(', ') : '',
      sort: String(item.sort ?? 100),
      active: Boolean(item.active),
      stackable: Boolean(item.stackable)
    };
  };

  let list: ShopItem[] = (data.items ?? []).map((item) => cloneItem(item));
  list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  let filter = '';
  let edit: EditableItem | null = null;
  let draggingId: string | null = null;
  let reorderBusy = false;
  let saving = false;
  let deletingId: string | null = null;
  let message: string | null = data.loadError ?? null;
  let imagePickerOpen = false;

  const matchesFilter = (item: ShopItem): boolean => {
    if (!filter) return true;
    const target = `${item.title ?? ''} ${item.slug ?? ''}`.toLowerCase();
    return target.includes(filter.toLowerCase());
  };

  const updateListWith = (item: ShopItem) => {
    const next = list.slice();
    const idx = next.findIndex((row) => row.id === item.id);
    if (idx >= 0) {
      next[idx] = cloneItem(item);
    } else {
      next.push(cloneItem(item));
    }
    next.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.title.localeCompare(b.title));
    list = next;
  };

  const removeFromList = (id: string) => {
    list = list.filter((item) => item.id !== id);
  };

  function startNew() {
    edit = toEditable();
    imagePickerOpen = false;
  }

  function startEdit(item: ShopItem) {
    edit = toEditable(item);
    imagePickerOpen = false;
  }

  function cancelEdit() {
    edit = null;
  }

  function pickImage(path: string) {
    if (edit) {
      edit.image_url = path;
    }
    imagePickerOpen = false;
  }

  async function save() {
    if (!edit || saving) return;
    saving = true;
    message = null;

    const form = new FormData();
    Object.entries(edit).forEach(([key, value]) => {
      if (key === 'tagsText') {
        form.set('tags', value);
        return;
      }
      form.set(key, typeof value === 'string' ? value : String(value));
    });

    const res = await fetch('?/upsert', { method: 'POST', body: form });
    const out = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));

    if (!res.ok || !out?.ok) {
      message = out?.error || 'Save failed';
      saving = false;
      return;
    }

    updateListWith(out.item as ShopItem);
    edit = null;
    saving = false;
  }

  async function remove(id: string) {
    if (deletingId || !confirm('Delete this item?')) return;
    deletingId = id;
    message = null;

    const form = new FormData();
    form.set('id', id);
    const res = await fetch('?/delete', { method: 'POST', body: form });
    const out = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));

    if (!res.ok || !out?.ok) {
      message = out?.error || 'Delete failed';
      deletingId = null;
      return;
    }

    removeFromList(id);
    deletingId = null;
  }

  function onDragStart(item: ShopItem) {
    draggingId = item.id;
  }

  async function onDrop(target: ShopItem) {
    if (!draggingId || draggingId === target.id || reorderBusy) return;

    const previous = list.map((item) => cloneItem(item));
    const sourceIndex = list.findIndex((row) => row.id === draggingId);
    const targetIndex = list.findIndex((row) => row.id === target.id);
    if (sourceIndex === -1 || targetIndex === -1) {
      draggingId = null;
      return;
    }

    const reordered = list.slice();
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const payload = reordered.map((item, index) => ({
      ...item,
      sort: (index + 1) * 10
    }));

    list = payload.map((item) => ({ ...item }));
    reorderBusy = true;
    message = null;

    const res = await fetch('?/reorder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload.map(({ id, sort }) => ({ id, sort })))
    });
    const out = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));

    reorderBusy = false;
    draggingId = null;

    if (!res.ok || !out?.ok) {
      message = out?.error || 'Reorder failed';
      list = previous;
    }
  }

  $: filtered = list.filter((item) => matchesFilter(item));
</script>

{#if data.forbidden}
  <div class="mx-auto mt-10 max-w-xl rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
    You don’t have admin access. Ask an owner to add your email to <code>ADMIN_EMAILS</code>.
  </div>
{:else}
  <div class="mx-auto max-w-screen-xl px-4 py-6">
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-lg font-semibold text-white">Shop Admin</h1>
        <p class="text-sm text-white/60">Create, update, and reorder items in the in-game shop.</p>
      </div>
      <button
        class="h-9 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-white/15"
        on:click={startNew}
      >
        New Item
      </button>
    </header>

    {#if message}
      <div class="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        {message}
      </div>
    {/if}

    {#if edit}
      <section class="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">
          {edit.id ? 'Edit item' : 'Create item'}
        </h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="field">
            <span>Slug</span>
            <input class="input" bind:value={edit.slug} placeholder="radiant-shard-pack" />
          </label>
          <label class="field">
            <span>Title</span>
            <input class="input" bind:value={edit.title} placeholder="Radiant Shard Pack" />
          </label>
          <label class="field">
            <span>Subtitle</span>
            <input class="input" bind:value={edit.subtitle} placeholder="Optional subtitle" />
          </label>
          <label class="field">
            <span>Type</span>
            <select class="input" bind:value={edit.type}>
              {#each typeOptions as type}
                <option value={type}>{type}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>Rarity</span>
            <select class="input" bind:value={edit.rarity}>
              {#each rarityOptions as rarity}
                <option value={rarity}>{rarity}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>Price (shards)</span>
            <input class="input" type="number" bind:value={edit.price_shards} min="0" step="1" />
          </label>
          <label class="field">
            <span>Sort</span>
            <input class="input" type="number" bind:value={edit.sort} step="1" />
          </label>
          <label class="field col-span-full">
            <span>Image URL</span>
            <div class="flex gap-2">
              <input
                class="input flex-1"
                placeholder="/games/tiles-run/cover-640.webp"
                bind:value={edit.image_url}
                list="image-options"
              />
              {#if data.imageOptions.length}
                <button
                  type="button"
                  class="h-9 rounded-full border border-white/15 bg-white/10 px-3 text-xs font-medium text-white/80 hover:bg-white/15"
                  on:click={() => (imagePickerOpen = !imagePickerOpen)}
                >
                  {imagePickerOpen ? 'Close' : 'Browse'}
                </button>
              {/if}
            </div>
            {#if imagePickerOpen}
              <div class="mt-2 max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                {#each data.imageOptions as option}
                  <button
                    type="button"
                    class="block w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/10"
                    on:click={() => pickImage(option)}
                  >
                    {option}
                  </button>
                {/each}
              </div>
            {/if}
          </label>
          <label class="field col-span-full">
            <span>Description</span>
            <textarea class="textarea" rows="3" bind:value={edit.description} placeholder="Optional description" />
          </label>
          <label class="field">
            <span>Tags (comma separated)</span>
            <input class="input" bind:value={edit.tagsText} placeholder="boost, limited" />
          </label>
          <label class="toggle">
            <input type="checkbox" bind:checked={edit.active} />
            <span>Active</span>
          </label>
          <label class="toggle">
            <input type="checkbox" bind:checked={edit.stackable} />
            <span>Stackable</span>
          </label>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            class="h-9 rounded-full bg-gradient-to-r from-cyan-400/80 to-fuchsia-400/80 px-4 text-sm font-semibold text-black/80 shadow hover:brightness-110 disabled:opacity-60"
            on:click|preventDefault={save}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save item'}
          </button>
          <button
            class="h-9 rounded-full border border-white/15 px-4 text-sm text-white/80 hover:bg-white/10"
            on:click={cancelEdit}
          >
            Cancel
          </button>
        </div>
      </section>
    {/if}

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <input
        class="h-9 w-full max-w-xs rounded-full border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/50"
        placeholder="Filter by title or slug"
        bind:value={filter}
      />
      <div class="text-xs text-white/50">{filtered.length} items</div>
    </div>

    <datalist id="image-options">
      {#each data.imageOptions as option}
        <option value={option} />
      {/each}
    </datalist>

    {#if !filtered.length}
      <p class="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/60">
        No items match the current filter.
      </p>
    {:else}
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each filtered as item (item.id)}
          <li
            draggable="true"
            on:dragstart={() => onDragStart(item)}
            on:drop={() => onDrop(item)}
            on:dragover|preventDefault
            on:dragend={() => (draggingId = null)}
          >
            <article class={`card ${draggingId === item.id ? 'opacity-70' : ''}`}>
              <div class="relative aspect-[16/9]">
                <img
                  src={item.image_url}
                  alt={item.title}
                  loading="lazy"
                  class="absolute inset-0 h-full w-full object-cover"
                />
                <div class="absolute right-2 top-2 flex gap-1 text-[10px] uppercase">
                  <span class="badge">{item.rarity}</span>
                  <span class="badge">💎 {item.price_shards}</span>
                </div>
                {#if !item.active}
                  <div class="absolute inset-0 bg-black/60 backdrop-blur-[1px]" />
                {/if}
              </div>
              <div class="flex items-start justify-between gap-3 px-3 py-2">
                <div>
                  <h3 class="text-sm font-semibold text-white">{item.title}</h3>
                  <p class="text-[11px] text-white/50">{item.slug}</p>
                  <div class="mt-1 flex flex-wrap gap-1 text-[10px] uppercase text-white/40">
                    {#if item.active}
                      <span class="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 px-2 py-[2px] text-emerald-200">
                        Active
                      </span>
                    {:else}
                      <span class="inline-flex items-center gap-1 rounded-full border border-rose-400/30 px-2 py-[2px] text-rose-200">
                        Inactive
                      </span>
                    {/if}
                    {#if item.stackable}
                      <span class="inline-flex items-center gap-1 rounded-full border border-sky-400/30 px-2 py-[2px] text-sky-200">
                        Stackable
                      </span>
                    {:else}
                      <span class="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 px-2 py-[2px] text-fuchsia-200">
                        Unique
                      </span>
                    {/if}
                  </div>
                </div>
                <div class="flex flex-col gap-2 text-xs">
                  <button class="chip" on:click={() => startEdit(item)}>Edit</button>
                  <button
                    class="chip danger"
                    on:click={() => remove(item.id)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </article>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .field span {
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .input {
    height: 38px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 23, 42, 0.35);
    color: white;
    font-size: 0.85rem;
  }

  .textarea {
    width: 100%;
    min-height: 90px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 23, 42, 0.35);
    color: white;
    font-size: 0.85rem;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .toggle input {
    width: 16px;
    height: 16px;
  }

  .card {
    overflow: hidden;
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.12);
    transition: transform 0.2s ease, border-color 0.2s ease;
  }

  .card:hover,
  .card:focus-within {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: 999px;
    padding: 2px 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.8);
  }

  .chip {
    display: inline-flex;
    justify-content: center;
    border-radius: 999px;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: rgba(255, 255, 255, 0.8);
    background: rgba(148, 163, 184, 0.12);
    transition: background 0.15s ease, color 0.15s ease;
  }

  .chip:hover {
    background: rgba(148, 163, 184, 0.2);
  }

  .chip.danger {
    border-color: rgba(248, 113, 113, 0.35);
    background: rgba(248, 113, 113, 0.12);
    color: rgba(254, 226, 226, 0.86);
  }

  .chip.danger:hover {
    background: rgba(248, 113, 113, 0.2);
  }
</style>
