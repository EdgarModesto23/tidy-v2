<script lang="ts">
  import Calendar from "$lib/components/ui/calendar/calendar.svelte";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import { getLocalTimeZone, type CalendarDate } from "@internationalized/date";

  let {
    id,
    label,
    name,
    value = $bindable(),
    required = false,
    captionLayout = "dropdown",
    maxValue,
    minValue,
    placeholder = "Select date",
    labelClass = "text-sm font-medium",
    buttonClass = "w-full justify-between font-normal",
  }: {
    id: string;
    label: string;
    name: string;
    value?: CalendarDate;
    required?: boolean;
    captionLayout?: "dropdown" | "dropdown-months" | "dropdown-years" | "label";
    maxValue?: CalendarDate;
    minValue?: CalendarDate;
    placeholder?: string;
    labelClass?: string;
    buttonClass?: string;
  } = $props();

  let open = $state(false);

  const triggerId = $derived(`${id}-trigger`);
</script>

<div class="flex flex-col gap-1.5">
  <label for={triggerId} class={labelClass}>{label}</label>
  <input
    type="hidden"
    {name}
    value={value?.toString() ?? ""}
    {required}
  />
  <Popover.Root bind:open>
    <Popover.Trigger id={triggerId}>
      {#snippet child({ props })}
        <Button
          {...props}
          type="button"
          variant="outline"
          class={buttonClass}
        >
          {value
            ? value.toDate(getLocalTimeZone()).toLocaleDateString()
            : placeholder}
          <ChevronDownIcon class="size-4 shrink-0 opacity-70" />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-auto overflow-hidden p-0" align="start">
      <Calendar
        type="single"
        bind:value
        {captionLayout}
        onValueChange={() => {
          open = false;
        }}
        {maxValue}
        {minValue}
      />
    </Popover.Content>
  </Popover.Root>
</div>
