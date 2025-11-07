<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    goto('/app/home?open=notifications');
  });
</script>

<p class="sr-only">Redirecting…</p>
