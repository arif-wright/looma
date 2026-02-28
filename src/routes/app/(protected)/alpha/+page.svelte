<script lang="ts">
  import { logout } from '$lib/auth/logout';
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';

  export let data: any;

  const contactEmail: string | null = data?.alphaContactEmail ?? null;
  const contactText: string =
    data?.alphaContactText ?? 'If you think you should have access, contact the Looma team.';
</script>

<svelte:head>
  <title>Looma — Alpha Access Required</title>
</svelte:head>

<div class="alpha-root">
  <SanctuaryPageFrame
    eyebrow="Access"
    title="Alpha access required"
    subtitle="This build is still gated while we tune the sanctuary experience and the companion loop."
  >
    <svelte:fragment slot="actions">
      <EmotionalChip tone="warm">Limited build</EmotionalChip>
    </svelte:fragment>

    <main class="alpha-shell" aria-label="Alpha access required">
      <section class="alpha-card">
        <div class="alpha-copy">
          <p class="alpha-eyebrow">Private entry</p>
          <h2>You are signed in, but this account is not on the active alpha list yet.</h2>
          <p>{contactText}</p>
          {#if contactEmail}
            <p>
              Contact:
              <a class="alpha-email" href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </p>
          {/if}
        </div>

        <div class="alpha-status">
          <article class="status-card">
            <span class="status-card__label">What this means</span>
            <strong>Access is being rolled out gradually.</strong>
            <span>Your account is valid, but this build is still invite-limited while core flows are tuned.</span>
          </article>
          <article class="status-card">
            <span class="status-card__label">What to do next</span>
            <strong>Request entry or return later.</strong>
            <span>We can enable access manually if this account should already be inside the current alpha ring.</span>
          </article>
        </div>

        <div class="alpha-actions">
          <button type="button" class="alpha-btn alpha-btn--ghost" on:click={() => logout()}>Sign out</button>
          <a class="alpha-btn alpha-btn--primary" href="/">Back to site</a>
        </div>
      </section>
    </main>
  </SanctuaryPageFrame>
</div>

<style>
  .alpha-root {
    min-height: 100vh;
  }

  .alpha-shell {
    padding: 1rem 0 calc(5rem + env(safe-area-inset-bottom));
  }

  .alpha-card {
    width: min(100%, 46rem);
    margin: 0 auto;
    border-radius: 1.35rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(160deg, rgba(25, 21, 16, 0.8), rgba(10, 13, 17, 0.9)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.14), transparent 44%);
    padding: 1rem;
    display: grid;
    gap: 1rem;
  }

  .alpha-copy,
  .alpha-status {
    display: grid;
    gap: 0.8rem;
  }

  .alpha-eyebrow,
  .status-card__label {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.78);
  }

  .alpha-copy h2,
  .status-card strong {
    margin: 0;
    color: rgba(249, 243, 230, 0.98);
  }

  .alpha-copy h2 {
    font-family: var(--san-font-display);
    font-size: clamp(1.55rem, 5vw, 2.35rem);
    line-height: 1.08;
  }

  .alpha-copy p,
  .status-card span:last-child {
    margin: 0;
    color: rgba(223, 211, 188, 0.8);
    line-height: 1.55;
  }

  .alpha-email {
    color: rgba(244, 222, 178, 0.94);
    text-decoration: none;
  }

  .alpha-email:hover,
  .alpha-email:focus-visible {
    text-decoration: underline;
    outline: none;
  }

  .status-card {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.14);
    background:
      linear-gradient(180deg, rgba(30, 24, 17, 0.66), rgba(13, 16, 19, 0.9)),
      radial-gradient(circle at top, rgba(214, 190, 141, 0.08), transparent 58%);
    padding: 0.9rem;
    display: grid;
    gap: 0.2rem;
  }

  .alpha-actions {
    display: grid;
    gap: 0.75rem;
  }

  .alpha-btn {
    min-height: 3rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.85rem 1.1rem;
    border: 1px solid rgba(214, 190, 141, 0.18);
    text-decoration: none;
    font-weight: 600;
    cursor: pointer;
  }

  .alpha-btn--ghost {
    background: rgba(255, 255, 255, 0.04);
    color: rgba(245, 236, 223, 0.92);
  }

  .alpha-btn--primary {
    background: linear-gradient(135deg, rgba(214, 190, 141, 0.24), rgba(125, 211, 252, 0.16));
    color: rgba(249, 243, 230, 0.96);
  }

  @media (min-width: 700px) {
    .alpha-status {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .alpha-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
