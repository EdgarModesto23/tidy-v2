<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";
  import ClientToaster from "$lib/components/ui/sonner/client-toaster.svelte";
  import "../app.css";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>Tidy — Tasks</title>
</svelte:head>

<div>
  {@render children()}
</div>

<ClientToaster />
