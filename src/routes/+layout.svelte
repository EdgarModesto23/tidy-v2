<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";
  import ClientToaster from "$lib/components/ui/sonner/client-toaster.svelte";
  import { ModeWatcher } from "mode-watcher";
  import "../app.css";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>Tidy — Tasks</title>
</svelte:head>

<div>
  <ModeWatcher defaultMode={"system"} />
  {@render children()}
</div>

<ClientToaster />
