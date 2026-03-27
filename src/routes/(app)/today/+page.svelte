<script lang="ts">
  import { resolve } from "$app/paths";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const sorted = $derived(
    [...data.sessions].sort(
      (a, b) =>
        new Date(a.scheduled_start_at!).getTime() -
        new Date(b.scheduled_start_at!).getTime(),
    ),
  );

  function formatRange(start: string, end: string | null): string {
    const a = new Date(start);
    const f = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    if (end) {
      const b = new Date(end);
      const t = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
      return `${f.format(a)} → ${t.format(b)}`;
    }
    return f.format(a);
  }

  function prevDay(iso: string): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function nextDay(iso: string): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
</script>

<div class="space-y-6">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-foreground text-2xl font-semibold tracking-tight">Today</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        {data.dayIso} · {data.tz}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <a
        href={`${resolve("/today")}?day=${prevDay(data.dayIso)}`}
        class="border-input bg-background hover:bg-accent inline-flex h-9 items-center rounded-md border px-3 text-sm"
        >Previous day</a
      >
      <a
        href={`${resolve("/today")}?day=${nextDay(data.dayIso)}`}
        class="border-input bg-background hover:bg-accent inline-flex h-9 items-center rounded-md border px-3 text-sm"
        >Next day</a
      >
      <a
        href={resolve("/calendar")}
        class="text-primary inline-flex h-9 items-center px-3 text-sm font-medium underline-offset-4 hover:underline"
        >Month</a
      >
    </div>
  </div>

  {#if data.rangeError}
    <p class="text-destructive text-sm">{data.rangeError}</p>
  {/if}

  {#if sorted.length === 0}
    <p class="text-muted-foreground text-sm">No scheduled sessions on this day.</p>
  {:else}
    <ul class="border-border/80 divide-border/80 divide-y rounded-xl border">
      {#each sorted as s (s.id)}
        <li class="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <p class="text-foreground font-medium">
              {s.name}
            </p>
            <p class="text-muted-foreground text-sm">
              {s.program_name} · {s.module_title}
            </p>
          </div>
          <p class="text-foreground shrink-0 text-sm tabular-nums sm:text-right">
            {formatRange(s.scheduled_start_at!, s.scheduled_end_at)}
          </p>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="text-muted-foreground text-sm">
    <a
      href={resolve("/settings/availability")}
      class="text-primary font-medium underline-offset-4 hover:underline"
      >Working hours</a
    >
  </p>
</div>
