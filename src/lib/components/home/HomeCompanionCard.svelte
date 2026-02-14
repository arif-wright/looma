<script lang="ts">
  import type { ActiveCompanionSnapshot } from '$lib/stores/companions';

  export let companion: ActiveCompanionSnapshot | null = null;
  export let bondLevel = 0;
  export let statusLabel = 'Steady';
  export let statusText = 'Your bond is humming.';

  const fallbackAvatar = '/avatar.svg';
</script>

<section class="card companion" aria-label="Companion status">
  <p class="companion__eyebrow">Attune</p>

  {#if companion}
    <div class="companion__row">
      <div class="companion__avatar-wrap" aria-hidden="true">
        <span class="companion__ring"></span>
        <img src={companion.avatar_url ?? fallbackAvatar} alt="" class="companion__avatar" />
      </div>
      <div>
        <h3>{companion.name}</h3>
        <p class="companion__meta">Bond Lv {bondLevel}</p>
      </div>
    </div>
    <p class="companion__status"><strong>{statusLabel}.</strong> {statusText}</p>
    <a href="/app/companions" class="companion__link">Open companion</a>
  {:else}
    <h3>No companion selected</h3>
    <p class="companion__status">Choose a companion to start your relationship loop.</p>
    <a href="/app/companions" class="companion__link">Pick companion</a>
  {/if}
</section>

<style>
  .card {
    border-radius: 1.2rem;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: linear-gradient(164deg, rgba(15, 23, 42, 0.82), rgba(20, 36, 63, 0.8));
    padding: 1rem;
    box-shadow: 0 20px 42px rgba(8, 15, 30, 0.33);
    backdrop-filter: blur(12px);
  }

  .companion__eyebrow {
    margin: 0 0 0.6rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(125, 211, 252, 0.88);
  }

  .companion__row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  h3 {
    margin: 0;
    font-size: 1.06rem;
    color: rgba(248, 250, 252, 0.98);
  }

  .companion__meta {
    margin: 0.2rem 0 0;
    font-size: 0.82rem;
    color: rgba(203, 213, 225, 0.82);
  }

  .companion__avatar-wrap {
    width: 3rem;
    height: 3rem;
    border-radius: 999px;
    position: relative;
    display: grid;
    place-items: center;
  }

  .companion__ring {
    position: absolute;
    inset: -2px;
    border-radius: 999px;
    background: conic-gradient(from 20deg, rgba(56, 189, 248, 0.85), rgba(45, 212, 191, 0.7), rgba(56, 189, 248, 0.85));
    filter: blur(1px);
    opacity: 0.8;
  }

  .companion__avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    position: relative;
    z-index: 1;
    background: rgba(15, 23, 42, 0.82);
  }

  .companion__status {
    margin: 0.8rem 0 0;
    font-size: 0.88rem;
    color: rgba(226, 232, 240, 0.9);
  }

  .companion__link {
    margin-top: 0.8rem;
    display: inline-flex;
    text-decoration: none;
    color: rgba(125, 211, 252, 0.96);
    font-size: 0.86rem;
    font-weight: 600;
  }
</style>
