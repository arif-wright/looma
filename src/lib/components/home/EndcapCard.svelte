<script lang="ts">
  type Endcap = {
    title: string;
    description?: string;
    href: string;
  };

  export let endcap: Endcap;
  export let id: string | undefined;
</script>

<article class="endcap" aria-labelledby={id}>
  <div>
    <h2 id={id}>{endcap.title}</h2>
    {#if endcap.description}
      <p>{endcap.description}</p>
    {/if}
  </div>
  <a href={endcap.href} class="action">Do it now</a>
</article>

<style>
  .endcap {
    border-radius: 22px;
    border: 1px solid rgba(59, 130, 246, 0.35);
    background: linear-gradient(135deg, rgba(15, 118, 110, 0.4), rgba(59, 130, 246, 0.25));
    padding: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  h2 {
    margin: 0 0 6px;
    font-size: 1.2rem;
  }

  p {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(226, 232, 240, 0.85);
  }

  .action {
    border-radius: 999px;
    padding: 10px 20px;
    border: 1px solid rgba(226, 232, 240, 0.6);
    text-decoration: none;
    color: rgba(226, 232, 240, 0.95);
    font-weight: 600;
    background: rgba(15, 23, 42, 0.3);
    transition: background 0.2s ease, transform 0.2s ease;
  }

  .action:hover,
  .action:focus-visible {
    background: rgba(15, 23, 42, 0.45);
    transform: translateY(-1px);
  }

  @media (max-width: 640px) {
    .endcap {
      flex-direction: column;
      align-items: flex-start;
    }

    .action {
      width: 100%;
      text-align: center;
    }
  }
</style>
