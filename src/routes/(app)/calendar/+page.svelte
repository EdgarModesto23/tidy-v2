<script lang="ts">
  import { resolve } from "$app/paths";
  import type { CalendarSessionItem } from "$lib/learning/calendar";
  import { dayStartUtc, weekdaySun0 } from "$lib/learning/timezone";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  function utcIsoToLocalDate(iso: string, tz: string): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  }

  const calendarModel = $derived.by(() => {
    const tz = data.tz;
    const parts = data.monthParam.split("-").map(Number);
    const y = parts[0] ?? new Date().getFullYear();
    const m = parts[1] ?? 1;
    const monthIndex = m - 1;
    const daysInMonth = new Date(y, monthIndex + 1, 0).getDate();
    const firstIso = `${y}-${String(m).padStart(2, "0")}-01`;
    const firstMs = dayStartUtc(firstIso, tz);
    const padWeek = weekdaySun0(firstMs, tz);

    const byDay = new Map<string, CalendarSessionItem[]>();
    for (const s of data.sessions) {
      if (!s.scheduled_start_at) continue;
      const key = utcIsoToLocalDate(s.scheduled_start_at, tz);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(s);
    }

    const cells: { iso: string; inMonth: boolean; sessions: CalendarSessionItem[] }[] =
      [];

    for (let i = 0; i < padWeek; i++) {
      cells.push({ iso: "", inMonth: false, sessions: [] });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({
        iso,
        inMonth: true,
        sessions: byDay.get(iso) ?? [],
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ iso: "", inMonth: false, sessions: [] });
    }

    return { cells };
  });

  function shiftMonthParam(delta: number): string {
    const parts = data.monthParam.split("-").map(Number);
    const y = parts[0] ?? new Date().getFullYear();
    const mo = (parts[1] ?? 1) - 1;
    const d = new Date(Date.UTC(y, mo + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function formatTime(iso: string): string {
    return new Intl.DateTimeFormat(undefined, {
      timeStyle: "short",
    }).format(new Date(iso));
  }
</script>

<div class="space-y-6">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-foreground text-2xl font-semibold tracking-tight">
        {data.monthLabel}
      </h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Scheduled sessions in {data.tz}. Planned roadmap dates are separate until you
        start a module.
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <a
        href={`${resolve("/calendar")}?month=${shiftMonthParam(-1)}`}
        class="border-input bg-background hover:bg-accent inline-flex h-9 items-center rounded-md border px-3 text-sm"
        >Previous</a
      >
      <a
        href={`${resolve("/calendar")}?month=${shiftMonthParam(1)}`}
        class="border-input bg-background hover:bg-accent inline-flex h-9 items-center rounded-md border px-3 text-sm"
        >Next</a
      >
      <a
        href={resolve("/today")}
        class="text-primary inline-flex h-9 items-center px-3 text-sm font-medium underline-offset-4 hover:underline"
        >Today</a
      >
    </div>
  </div>

  {#if data.rangeError}
    <p class="text-destructive text-sm">{data.rangeError}</p>
  {/if}

  <div
    class="border-border/80 grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border text-center text-xs"
  >
    {#each ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as h (h)}
      <div class="bg-muted/40 text-muted-foreground py-2 font-medium">{h}</div>
    {/each}
    {#each calendarModel.cells as cell, i (i)}
      <div
        class="bg-card min-h-[5.5rem] p-1.5 text-left align-top sm:min-h-[6.5rem] sm:p-2"
        class:opacity-40={!cell.inMonth}
      >
        {#if cell.inMonth}
          <p class="text-muted-foreground mb-1 text-[11px] font-medium tabular-nums">
            {Number(cell.iso.slice(8, 10))}
          </p>
          <ul class="space-y-0.5">
            {#each cell.sessions as s (s.id)}
              <li>
                <span
                  class="bg-primary/15 text-foreground block truncate rounded px-1 py-0.5 text-[10px] leading-tight sm:text-[11px]"
                  title="{s.program_name} · {s.module_title}"
                >
                  {formatTime(s.scheduled_start_at!)} {s.name}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/each}
  </div>

  <p class="text-muted-foreground text-sm">
    <a
      href={resolve("/settings/availability")}
      class="text-primary font-medium underline-offset-4 hover:underline"
      >Working hours</a
    >
  </p>
</div>
