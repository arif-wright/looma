<script lang="ts">
  export let label: string;
  export let value: string | number;
</script>

<div class="stat-badge" role="group" aria-label={label}>
  <span class="stat-label">{label}</span>
  <span class="stat-value">{value}</span>
</div>

<style>
  .stat-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: linear-gradient(120deg, rgba(25, 36, 68, 0.75), rgba(69, 34, 118, 0.65));
    border: 1px solid rgba(233, 195, 255, 0.35);
    box-shadow: 0 12px 24px rgba(12, 16, 36, 0.45);
    font-size: 0.82rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .stat-label {
    color: rgba(230, 222, 255, 0.72);
  }

  .stat-value {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.92);
  }
</style>
