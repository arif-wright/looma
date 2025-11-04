<script lang="ts">
  export let streak = 12;
</script>

<section class="streak">
  <header>
    <span class="label">Streak</span>
    <span class="value">{streak} days</span>
  </header>
  <p class="hint">Log in tomorrow to keep the loop alive.</p>
</section>

<style>
  .streak {
    display: grid;
    gap: 0.6rem;
    padding: 1.2rem;
    border-radius: 1.2rem;
    background: #242526;
    border: 1px solid rgba(59, 64, 75, 0.85);
  }

  header {
    display: flex;
    justify-content: space-between;
  }

  .label {
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.6);
  }

  .value {
    font-weight: 700;
    color: rgba(248, 250, 252, 0.95);
  }

  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(226, 232, 240, 0.65);
  }
</style>
