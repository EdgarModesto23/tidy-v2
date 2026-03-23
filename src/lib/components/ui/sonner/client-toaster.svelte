<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";

  let ToasterComponent = $state<any>(null);

  onMount(async () => {
    const mod = await import("./sonner.svelte");
    ToasterComponent = mod.default;
  });
</script>

{#if browser && ToasterComponent}
  <ToasterComponent position="top-center" closeButton richColors />
{/if}
