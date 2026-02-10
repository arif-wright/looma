<script lang="ts">
  import { logout } from '$lib/auth/logout';

  export let data: any;

  const contactEmail: string | null = data?.alphaContactEmail ?? null;
  const contactText: string =
    data?.alphaContactText ?? 'If you think you should have access, contact the Looma team.';
</script>

<svelte:head>
  <title>Looma — Alpha Access Required</title>
</svelte:head>

<main class="alpha-page" aria-label="Alpha access required">
  <section class="alpha-card panel-glass">
    <p class="kicker">Alpha</p>
    <h1>Alpha access required</h1>
    <p class="copy">This build is limited while we tune the experience.</p>
    <p class="copy">{contactText}</p>
    {#if contactEmail}
      <p class="copy">
        Contact: <a class="email" href={`mailto:${contactEmail}`}>{contactEmail}</a>
      </p>
    {/if}

    <div class="actions">
      <button type="button" class="btn-ghost" on:click={() => logout()}>Sign out</button>
      <a class="btn-primary" href="/">Back to site</a>
    </div>
  </section>
</main>

<style>
  .alpha-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: clamp(1.5rem, 4vw, 3rem);
  }

  .alpha-card {
    width: min(620px, 100%);
    padding: 1.6rem 1.6rem 1.4rem;
    border-radius: 22px;
  }

  .kicker {
    margin: 0 0 0.6rem;
    font-size: 0.72rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.7);
  }

  h1 {
    margin: 0;
    font-size: clamp(1.6rem, 2.5vw, 2.1rem);
    line-height: 1.1;
    letter-spacing: -0.01em;
  }

  .copy {
    margin: 0.6rem 0 0;
    color: rgba(226, 232, 240, 0.78);
    line-height: 1.55;
  }

  .email {
    color: rgba(94, 242, 255, 0.92);
    text-decoration: none;
  }

  .email:hover,
  .email:focus-visible {
    text-decoration: underline;
    outline: none;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.25rem;
    flex-wrap: wrap;
  }

  .btn-primary,
  .btn-ghost {
    border-radius: 999px;
    padding: 0.7rem 1.2rem;
    font-weight: 600;
    border: 1px solid rgba(255, 255, 255, 0.14);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-ghost {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(248, 250, 255, 0.86);
  }

  .btn-ghost:hover,
  .btn-ghost:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    outline: none;
  }

  .btn-primary {
    border-color: transparent;
    background: linear-gradient(120deg, rgba(94, 242, 255, 0.95), rgba(155, 92, 255, 0.92));
    color: rgba(8, 10, 22, 0.92);
    box-shadow: 0 18px 36px rgba(94, 242, 255, 0.22);
  }

  .btn-primary:hover,
  .btn-primary:focus-visible {
    filter: brightness(1.05);
    outline: none;
  }
 </style>

