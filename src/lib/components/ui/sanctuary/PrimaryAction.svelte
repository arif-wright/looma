<script lang="ts">
  export let className = '';
  export { className as class };
  export let disabled = false;
</script>

<button class={`primary-action ${className}`} {disabled}>
  <slot />
</button>

<style>
  .primary-action {
    min-height: 2.8rem;
    border-radius: 999px;
    border: 1px solid rgba(228, 237, 248, 0.34);
    background: linear-gradient(145deg, rgba(30, 44, 104, 0.72), rgba(18, 28, 72, 0.84));
    color: rgba(242, 247, 252, 0.96);
    font-weight: 600;
    letter-spacing: 0.015em;
    padding: 0 1rem;
    transition:
      transform 220ms var(--san-ease-out),
      border-color 220ms var(--san-ease-out),
      opacity 220ms var(--san-ease-out);
  }

  .primary-action:hover,
  .primary-action:focus-visible {
    transform: translateY(-1px);
    border-color: rgba(241, 246, 253, 0.62);
    outline: none;
  }

  .primary-action:disabled {
    opacity: 0.62;
    cursor: not-allowed;
    transform: none;
  }
</style>

