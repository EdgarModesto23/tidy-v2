<script lang="ts">
  import { tick } from "svelte";
  import Calendar from "$lib/components/ui/calendar/calendar.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import {
    getLocalTimeZone,
    parseDate,
    type CalendarDate,
  } from "@internationalized/date";

  let {
    id,
    label,
    isoValue,
    onIsoChange,
  }: {
    id: string;
    label: string;
    isoValue: string;
    onIsoChange: (iso: string) => void;
  } = $props();

  let open = $state(false);
  let value = $state<CalendarDate | undefined>();

  $effect(() => {
    value = parseDate(isoValue);
  });

  const triggerId = $derived(`${id}-trigger`);
</script>

<div class="flex min-w-0 flex-col gap-1">
  <label
    for={triggerId}
    class="text-muted-foreground text-[10px] font-medium">{label}</label
  >
  <Popover.Root bind:open>
    <Popover.Trigger id={triggerId}>
      {#snippet child({ props })}
        <Button
          {...props}
          type="button"
          variant="outline"
          class="nodrag nopan h-7 w-full justify-between px-1.5 text-[11px] font-normal"
        >
          {value
            ? value.toDate(getLocalTimeZone()).toLocaleDateString()
            : "—"}
          <ChevronDownIcon class="size-3 shrink-0 opacity-70" />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-auto overflow-hidden p-0" align="start">
      <Calendar
        type="single"
        bind:value
        captionLayout="dropdown"
        onValueChange={async () => {
          await tick();
          if (value) onIsoChange(value.toString());
          open = false;
        }}
      />
    </Popover.Content>
  </Popover.Root>
</div>
