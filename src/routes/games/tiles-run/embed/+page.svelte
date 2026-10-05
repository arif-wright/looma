<svelte:head>
  <title>Tiles Run archive</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</svelte:head>

<main data-testid="tiles-legacy-notice">
  <h1>Tiles Run is archived</h1>
  <p>This old game window no longer starts a run. Your past scores, rewards and achievements are preserved.</p>
  <a href="/app/games/tiles-run" target="_top">Open the Tiles Run archive</a>
</main>

<style>
  :global(body) { margin: 0; background: #171021; color: #f4edf9; font-family: system-ui, sans-serif; }
  main { box-sizing: border-box; display: grid; align-content: center; gap: 1rem; min-height: 100dvh; max-width: 42rem; margin: auto; padding: 2rem; }
  h1, p { margin: 0; line-height: 1.5; }
  a { display: inline-block; padding: .75rem 0; color: #dfbdf7; }
  a:focus-visible { outline: 3px solid #f7d396; outline-offset: 3px; }
</style>
