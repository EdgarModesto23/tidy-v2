<script lang="ts">
  import type { DateValue } from "@internationalized/date";
  import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
  import { buttonVariants } from "$lib/components/ui/button/button.svelte";
  import * as Calendar from "$lib/components/ui/calendar";
  import * as Popover from "$lib/components/ui/popover";
  import { cn } from "$lib/utils.js";

  let {
    name,
    id,
    label,
    placeholder = "Pick a date",
    class: className,
  }: {
    name: string;
    id: string;
    label: string;
    placeholder?: string;
    class?: string;
  } = $props();

  let value = $state<DateValue | undefined>(undefined);
  let open = $state(false);

  const iso = $derived(
    !value
      ? ""
      : `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`,
  );

  const triggerLabel = $derived.by(() => {
    if (!value) return placeholder;
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(value.year, value.month - 1, value.day),
    );
  });
</script>

<div class={cn("flex flex-col gap-1.5", className)}>
  <label
    for={`${id}-btn`}
    class="text-foreground text-sm font-medium"
    id={`${id}-label`}>{label}</label>
  <input type="hidden" {name} value={iso} />
  <Popover.Root bind:open>
    <Popover.Trigger
      id={`${id}-btn`}
      type="button"
      class={cn(
        buttonVariants({ variant: "outline", size: "default" }),
        "h-9 w-full justify-start gap-2 rounded-2xl font-normal",
        !value && "text-muted-foreground",
      )}
      aria-labelledby={`${id}-label`}
    >
      <CalendarDaysIcon class="size-4 shrink-0 opacity-70" aria-hidden="true" />
      {triggerLabel}
    </Popover.Trigger>
    <Popover.Content class="w-auto p-0" align="start">
      <Calendar.Calendar
        type="single"
        bind:value
        onValueChange={() => {
          open = false;
        }}
        initialFocus
        captionLayout="dropdown"
      />
    </Popover.Content>
  </Popover.Root>
</div>
