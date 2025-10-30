<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import type { CreatureView, Species } from "$lib/types/creatures";

  export let data: { creatures: CreatureView[]; species: Species[] };

  let speciesId = "";
  let nickname = "";
  let errorMessage: string | null = null;
  let isSubmitting = false;
  let creatures: CreatureView[] = data.creatures;
  let species: Species[] = data.species;

  async function createCreature(event: Event) {
    event.preventDefault();
    errorMessage = null;

    if (!speciesId) {
      errorMessage = "Select a species before creating a creature.";
      return;
    }

    isSubmitting = true;

    try {
      const body: Record<string, unknown> = { species_id: speciesId };
      if (nickname.trim()) {
        body.nickname = nickname.trim();
      }

      const response = await fetch("/api/creatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        errorMessage = payload?.error ?? "Failed to create creature.";
        return;
      }

      speciesId = "";
      nickname = "";
      await invalidateAll();
    } finally {
      isSubmitting = false;
    }
  }

  $: creatures = data.creatures;
  $: species = data.species;
</script>

<section class="creatures">
  <header>
    <h1>Creatures</h1>
    <p>Track your bonded companions. All data stays server-side via Supabase RLS.</p>
  </header>
  <form class="create-form" on:submit={createCreature}>
    <label>
      Species
      <select bind:value={speciesId} required>
        <option value="" disabled>Select a species</option>
        {#each species as option}
          <option value={option.id}>
            {option.name} ({option.rarity})
          </option>
        {/each}
      </select>
    </label>

    <label>
      Nickname (optional)
      <input type="text" bind:value={nickname} placeholder="Glim" maxlength="120" />
    </label>

    <button type="submit" disabled={isSubmitting}>
      {#if isSubmitting}Creating...{:else}Create Creature{/if}
    </button>

    {#if errorMessage}
      <p class="error">{errorMessage}</p>
    {/if}
  </form>

  <section class="list">
    <h2>My creatures</h2>

    {#if creatures.length === 0}
      <p>You have not bonded with any creatures yet.</p>
    {:else}
      <ul>
        {#each creatures as creature}
          <li>
            <a class="item-link" href={"/app/creatures/" + creature.id}>
              <strong>{creature.species_name}</strong>
              <span class="rarity">{creature.species_rarity}</span>
              {#if creature.nickname}
                <span class="nickname">Nickname: {creature.nickname}</span>
              {/if}
              <span class="bond">Bond Level: {creature.bond_level}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</section>
<style>
  .creatures {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  header h1 {
    font-size: 1.5rem;
    margin: 0;
  }

  .create-form {
    display: grid;
    gap: 1rem;
    max-width: 28rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-weight: 500;
  }

  select,
  input {
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    padding: 0.5rem;
    font-size: 1rem;
  }

  button {
    align-self: flex-start;
    background: #111827;
    color: #fff;
    border: none;
    border-radius: 0.375rem;
    padding: 0.5rem 1rem;
    cursor: pointer;
  }

  button[disabled] {
    opacity: 0.7;
    cursor: wait;
  }

  .error {
    color: #b91c1c;
    font-size: 0.9rem;
  }

  .list ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .list li {
    margin: 0;
  }

  .item-link {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    text-decoration: none;
    color: inherit;
    background: #ffffff;
  }

  .item-link:hover,
  .item-link:focus {
    border-color: #cbd5f5;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }

  .rarity {
    text-transform: capitalize;
    color: #6b7280;
  }

  .nickname,
  .bond {
    color: #374151;
  }
</style>
