<script lang="ts">
  import '../app.css';
  import '$lib/theme/branding.css';
  import favicon from '$lib/assets/favicon.svg';
  import { currentProfile } from '$lib/stores/profile';

  let { data, children } = $props();

  $: currentProfile.set(data?.profile ?? null);
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap"
  />
</svelte:head>

{@render children?.()}
