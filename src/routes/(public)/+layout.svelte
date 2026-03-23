<script lang="ts">
  let { children } = $props();
</script>

<div
  class="bg-background flex min-h-svh flex-col items-center justify-center px-4 py-10"
>
  {@render children()}
</div>
