<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { dbActionToastEnhance } from "$lib/forms/dbActionToastEnhance";
  import { COMMON_IANA_TIMEZONES } from "$lib/learning/timezones";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const dayItems = DAY_LABELS.map((label, i) => ({
    value: String(i),
    label: `${i} — ${label}`,
  }));
  const tzItems = COMMON_IANA_TIMEZONES.map((z) => ({ value: z, label: z }));

  const TIME_INPUT_CLASS =
    "bg-background h-10 appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none";

  function timeForInput(val: unknown): string {
    const s = String(val ?? "");
    if (/^\d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 8);
    if (/^\d{2}:\d{2}/.test(s)) return `${s.slice(0, 5)}:00`;
    return "09:00:00";
  }

  /** Checkbox group values "0"…"6" for bulk add */
  let bulkSelected = $state<string[]>([]);

  let newStart = $state("09:00:00");
  let newEnd = $state("17:00:00");
  let newTz = $state("UTC");

  let dayOfWeekById = $state<Record<string, string>>({});
  let tzById = $state<Record<string, string>>({});
  let timeStartById = $state<Record<string, string>>({});
  let timeEndById = $state<Record<string, string>>({});

  $effect.pre(() => {
    newTz = data.defaultTz ?? "UTC";
  });

  $effect.pre(() => {
    for (const w of data.windows) {
      if (dayOfWeekById[w.id] === undefined) {
        dayOfWeekById = { ...dayOfWeekById, [w.id]: String(w.day_of_week) };
      }
      if (tzById[w.id] === undefined) {
        tzById = { ...tzById, [w.id]: String(w.timezone) };
      }
      if (timeStartById[w.id] === undefined) {
        timeStartById = {
          ...timeStartById,
          [w.id]: timeForInput(w.start_local_time),
        };
      }
      if (timeEndById[w.id] === undefined) {
        timeEndById = {
          ...timeEndById,
          [w.id]: timeForInput(w.end_local_time),
        };
      }
    }
  });

  function presetDays(nums: number[]) {
    bulkSelected = nums.map(String);
  }

  function dayLabelFor(value: string | undefined): string {
    return dayItems.find((d) => d.value === value)?.label ?? "Weekday";
  }

  function tzLabelFor(value: string | undefined): string {
    return value?.trim() ? value : "Timezone";
  }

  const enhanceBulk = $derived(
    dbActionToastEnhance("Adding windows…", "Saved.", {
      onSuccess: async () => {
        await invalidate("app:learning:availability");
        await invalidate("app:learning:calendar");
      },
    }),
  );

  const enhanceOpts = $derived(
    dbActionToastEnhance("Saving…", "Saved.", {
      onSuccess: async () => {
        await invalidate("app:learning:availability");
        await invalidate("app:learning:calendar");
      },
    }),
  );
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-foreground text-2xl font-semibold tracking-tight">
      Working hours
    </h1>
    <p class="text-muted-foreground mt-1 text-sm">
      Sessions are scheduled inside these windows when you start a module. Pick
      several days at once or use a preset, then set hours once per group.
      Overnight hours need two rows (e.g. 22:00–23:59 and 00:00–02:00).
    </p>
  </div>

  {#if data.loadError}
    <p class="text-destructive text-sm">{data.loadError}</p>
  {/if}

  <Card>
    <CardHeader>
      <CardTitle>Add windows</CardTitle>
      <CardDescription>
        Choose which days share the same hours—one row is created per day. Use
        presets for common patterns, then tweak checkboxes or times as needed.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form
        method="POST"
        action="?/createWindowsBulk"
        class="flex flex-col gap-5"
        use:enhance={enhanceBulk}
      >
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">Quick presets</span>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="text-xs"
              onclick={() => presetDays([1, 2, 3, 4, 5])}>Mon–Fri</Button
            >
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="text-xs"
              onclick={() => presetDays([1, 3, 5])}>Mon, Wed, Fri</Button
            >
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="text-xs"
              onclick={() => presetDays([2, 4])}>Tue &amp; Thu</Button
            >
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="text-xs"
              onclick={() => presetDays([0, 6])}>Weekend</Button
            >
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="text-xs"
              onclick={() => presetDays([0, 1, 2, 3, 4, 5, 6])}
              >Every day</Button
            >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="text-xs"
              onclick={() => presetDays([])}>Clear</Button
            >
          </div>
        </div>

        <fieldset class="space-y-2">
          <legend class="text-sm font-medium">Days</legend>
          <div
            class="flex flex-wrap gap-x-4 gap-y-2"
            role="group"
            aria-label="Weekdays to include"
          >
            {#each [0, 1, 2, 3, 4, 5, 6] as dow (dow)}
              <label
                class="border-border/80 hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <input
                  type="checkbox"
                  name="days"
                  class="border-input size-4 shrink-0 rounded border"
                  bind:group={bulkSelected}
                  value={String(dow)}
                />
                <span class="text-sm">{DAY_LABELS[dow]}</span>
              </label>
            {/each}
          </div>
        </fieldset>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Timezone</span>
            <input type="hidden" name="timezone" value={newTz} />
            <Select.Root type="single" bind:value={newTz} items={tzItems}>
              <Select.Trigger id="bulk-tz" class="h-10 w-full min-w-0 text-sm">
                {tzLabelFor(newTz)}
              </Select.Trigger>
              <Select.Content>
                {#each tzItems as item (item.value)}
                  <Select.Item value={item.value} label={item.label} />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="bulk-start-time"
              >Start</label
            >
            <Input
              type="time"
              id="bulk-start-time"
              name="start_local_time"
              step="1"
              bind:value={newStart}
              class={TIME_INPUT_CLASS}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="bulk-end-time">End</label>
            <Input
              type="time"
              id="bulk-end-time"
              name="end_local_time"
              step="1"
              bind:value={newEnd}
              class={TIME_INPUT_CLASS}
            />
          </div>
        </div>
        <Button type="submit" class="w-full sm:w-auto"
          >Add windows for selected days</Button
        >
      </form>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Your windows</CardTitle>
      <CardDescription>
        Edit or remove rows. Changes apply to future scheduling.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-6">
      {#if data.windows.length === 0}
        <p class="text-muted-foreground text-sm">No windows yet.</p>
      {:else}
        {#each data.windows as w (w.id)}
          <div class="border rounded-xl p-4">
            <form
              method="POST"
              action="?/updateWindow"
              class="space-y-3 rounded-xl p-4"
              use:enhance={enhanceOpts}
            >
              <input type="hidden" name="id" value={w.id} />
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-muted-foreground text-xs">{w.timezone}</span>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium">Weekday</span>
                  <input
                    type="hidden"
                    name="day_of_week"
                    value={dayOfWeekById[w.id] ?? String(w.day_of_week)}
                  />
                  <Select.Root
                    type="single"
                    value={dayOfWeekById[w.id] ?? String(w.day_of_week)}
                    items={dayItems}
                    onValueChange={(v) => {
                      if (v !== undefined) {
                        dayOfWeekById = { ...dayOfWeekById, [w.id]: v };
                      }
                    }}
                  >
                    <Select.Trigger
                      id={`d-${w.id}`}
                      class="h-10 w-full min-w-0 text-sm"
                    >
                      {dayLabelFor(
                        dayOfWeekById[w.id] ?? String(w.day_of_week),
                      )}
                    </Select.Trigger>
                    <Select.Content>
                      {#each dayItems as item (item.value)}
                        <Select.Item value={item.value} label={item.label} />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium">Timezone</span>
                  <input
                    type="hidden"
                    name="timezone"
                    value={tzById[w.id] ?? String(w.timezone)}
                  />
                  <Select.Root
                    type="single"
                    value={tzById[w.id] ?? String(w.timezone)}
                    items={tzItems}
                    onValueChange={(v) => {
                      if (v !== undefined) {
                        tzById = { ...tzById, [w.id]: v };
                      }
                    }}
                  >
                    <Select.Trigger
                      id={`z-${w.id}`}
                      class="h-10 w-full min-w-0 text-sm"
                    >
                      {tzLabelFor(tzById[w.id] ?? String(w.timezone))}
                    </Select.Trigger>
                    <Select.Content>
                      {#if !COMMON_IANA_TIMEZONES.includes(String(w.timezone))}
                        <Select.Item
                          value={String(w.timezone)}
                          label={String(w.timezone)}
                        />
                      {/if}
                      {#each tzItems as item (item.value)}
                        <Select.Item value={item.value} label={item.label} />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium" for={`${w.id}-start-time`}
                    >Start</label
                  >
                  <Input
                    type="time"
                    id={`${w.id}-start-time`}
                    name="start_local_time"
                    step="1"
                    bind:value={timeStartById[w.id]}
                    class={TIME_INPUT_CLASS}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium" for={`${w.id}-end-time`}
                    >End</label
                  >
                  <Input
                    type="time"
                    id={`${w.id}-end-time`}
                    name="end_local_time"
                    step="1"
                    bind:value={timeEndById[w.id]}
                    class={TIME_INPUT_CLASS}
                  />
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <div class="ml-auto pt-3">
                  <Button type="submit" variant="secondary" size="sm"
                    >Save</Button
                  >
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    formaction="?/deleteWindow"
                    formmethod="POST"
                    name="id"
                    value={w.id}
                  >
                    Remove this window
                  </Button>
                </div>
              </div>
            </form>
          </div>
        {/each}
      {/if}
    </CardContent>
  </Card>

  <p class="text-muted-foreground text-sm">
    <a
      href={resolve("/calendar")}
      class="text-primary font-medium underline-offset-4 hover:underline"
      >Calendar</a
    >
    ·
    <a
      href={resolve("/today")}
      class="text-primary font-medium underline-offset-4 hover:underline"
      >Today</a
    >
  </p>
</div>
