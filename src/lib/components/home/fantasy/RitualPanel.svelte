<script lang="ts">
  import { Check, Gem } from 'lucide-svelte';

  export let completed = 3;

  const rituals = ['Give a gift to your companion', 'Play a game together', 'Complete a daily quest'];
</script>

<section class="side-panel" aria-labelledby="ritual-title">
  <header>
    <h2 id="ritual-title">Today's Ritual</h2>
    <span>{completed}/3</span>
  </header>
  <div class="rituals">
    {#each rituals as ritual, index}
      <div class="ritual">
        <span>{ritual}</span>
        <i class:done={index < completed}><Check size={14} /></i>
      </div>
    {/each}
  </div>
  <div class="bonus">
    <span>Ritual Bonus</span>
    <strong><Gem size={15} /> +50</strong>
  </div>
  <div class="meter"><span style={`width: ${(completed / 3) * 100}%`}></span></div>
</section>

<style>
  .side-panel {
    border: 1px solid rgba(166, 145, 255, 0.2);
    border-radius: 1rem;
    background:
      radial-gradient(circle at 80% 0%, rgba(139, 92, 246, 0.14), transparent 38%),
      rgba(17, 16, 39, 0.66);
    padding: 1rem;
    color: white;
    backdrop-filter: blur(22px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  header,
  .ritual,
  .bonus,
  .bonus strong {
    display: flex;
    align-items: center;
  }

  header,
  .ritual,
  .bonus {
    justify-content: space-between;
    gap: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 0.96rem;
  }

  header span,
  .ritual span,
  .bonus span {
    color: rgba(232, 228, 249, 0.75);
    font-size: 0.78rem;
  }

  .rituals {
    display: grid;
    gap: 0.8rem;
    margin: 1rem 0;
  }

  i {
    display: grid;
    width: 1.45rem;
    height: 1.45rem;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.58);
    font-style: normal;
  }

  i.done {
    background: linear-gradient(135deg, #7652ff, #a75cff);
    color: white;
    box-shadow: 0 0 18px rgba(155, 92, 255, 0.5);
  }

  .bonus {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 0.85rem;
  }

  .bonus strong {
    gap: 0.35rem;
    color: #e3b2ff;
    font-size: 0.92rem;
  }

  .meter {
    height: 0.25rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    margin-top: 0.8rem;
  }

  .meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #8a5cff, #ff69df);
  }
</style>
