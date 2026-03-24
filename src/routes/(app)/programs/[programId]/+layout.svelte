<script lang="ts">
  let { children } = $props();
</script>

<div class="flex w-full min-w-0 flex-col gap-6 pb-10">
  {@render children()}
</div>
