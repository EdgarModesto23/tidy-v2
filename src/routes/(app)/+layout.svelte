<script lang="ts">
  import { resolve } from "$app/paths";
  import { Button } from "$lib/components/ui/button";

  let { data, children } = $props();
</script>

<div class="mx-auto w-full max-w-lg px-4 py-8 md:py-12">
  <header
    class="border-border/80 mb-8 flex flex-wrap items-center justify-between gap-3 border-b pb-6"
  >
    <a
      href={resolve("/todo")}
      class="text-primary text-xs font-semibold tracking-widest uppercase"
      >Tidy</a
    >
    <nav class="flex flex-wrap items-center gap-2 sm:gap-3">
      <a
        href={resolve("/todo")}
        class="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >Tasks</a
      >
      <span
        class="text-muted-foreground hidden max-w-[14rem] truncate text-sm sm:inline"
        >{data.user?.email ?? ""}</span
      >
      <form method="POST" action="/auth/signout" class="inline">
        <Button type="submit" variant="outline" size="sm">Sign out</Button>
      </form>
    </nav>
  </header>
  {@render children()}
</div>
