<script lang="ts">
  import { setContext } from 'svelte';
  import type { LayoutData } from './$types';

  export let data: LayoutData;

  setContext('profile', data.profile);
  setContext('viewerId', data.viewerId);
</script>

<slot />
