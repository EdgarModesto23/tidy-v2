<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import {
    clearProgramBundleCache,
    clearProgramListCache,
  } from "$lib/cache/learningDataCache";
  import DestructiveConfirmDialog from "$lib/components/destructive-confirm-dialog.svelte";
  import { dbActionToastEnhance } from "$lib/forms/dbActionToastEnhance";
  import { SESSION_TYPE_LABEL } from "$lib/learning/sessionLabels";
  import type { LearningModuleRow, LearningSessionRow } from "$lib/learning/types";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ListIcon from "@lucide/svelte/icons/list";
  import PencilIcon from "@lucide/svelte/icons/pencil";
import PlayIcon from "@lucide/svelte/icons/play";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { cn } from "$lib/utils.js";

  type ModuleNodeData = {
    module: LearningModuleRow;
    programId: string;
    userId: string;
    sessions: LearningSessionRow[];
  };

  let { data }: NodeProps & { data: ModuleNodeData } = $props();

  async function afterModuleMutation() {
    if (!data.userId) return;
    clearProgramListCache(data.userId);
    clearProgramBundleCache(data.userId, data.programId);
    await invalidate("app:learning:list");
    await invalidate(`app:learning:program:${data.programId}`);
  }

  const done = $derived(!!data.module.completed_at);
  const lifecycle = $derived.by(() => {
    if (data.module.completed_at || data.module.module_state === "completed") {
      return "completed" as const;
    }
    if (data.module.module_state === "started") return "started" as const;
    return "pending" as const;
  });

  const completeEnhance = $derived(
    dbActionToastEnhance(
      lifecycle === "completed" ? "Reopening module…" : "Completing module…",
      lifecycle === "completed" ? "Module reopened." : "Module completed.",
      { onSuccess: afterModuleMutation },
    ),
  );

  const startEnhance = $derived(
    dbActionToastEnhance(
      "Starting module…",
      "Module started.",
      {
        onSuccess: async () => {
          startScheduleDialogOpen = false;
          await afterModuleMutation();
        },
      },
    ),
  );

  const deleteEnhance = dbActionToastEnhance("Removing module…", "Module removed.", {
    onSuccess: afterModuleMutation,
  });

  let moduleDeleteOpen = $state(false);
  let deleteModuleFormEl: HTMLFormElement | undefined = $state();

  const moduleDeleteDescription = $derived(
    !data.module.parent_module_id
      ? "Delete the root module? This removes every sub-module and their sessions."
      : "Remove this module and all of its sessions?",
  );

  let sessionsDialogOpen = $state(false);
  let startScheduleDialogOpen = $state(false);

  type Slot = {
    key: string;
    label: string;
  };

  const unscheduledSessions = $derived(
    data.sessions.filter((s) => !s.scheduled_start_at),
  );

  let draggedSessionId = $state<string | null>(null);
  let assignmentsBySession = $state<Record<string, string>>({});

  const calendarSlots = $derived.by(() => {
    const slots: Slot[] = [];
    const now = new Date();
    for (let d = 0; d < 7; d++) {
      const day = new Date(now);
      day.setDate(now.getDate() + d);
      const y = day.getFullYear();
      const m = String(day.getMonth() + 1).padStart(2, "0");
      const dd = String(day.getDate()).padStart(2, "0");
      const dayLabel = day.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      for (let h = 8; h <= 21; h++) {
        const hh = String(h).padStart(2, "0");
        slots.push({
          key: `${y}-${m}-${dd}T${hh}:00`,
          label: `${dayLabel} · ${hh}:00`,
        });
      }
    }
    return slots;
  });

  const slotToSession = $derived.by(() => {
    const m = new Map<string, string>();
    for (const [sid, slotKey] of Object.entries(assignmentsBySession)) {
      m.set(slotKey, sid);
    }
    return m;
  });

  const allAssigned = $derived(
    unscheduledSessions.length === 0 ||
      unscheduledSessions.every((s) => !!assignmentsBySession[s.id]),
  );

  function openStartDialog() {
    const next: Record<string, string> = {};
    startScheduleDialogOpen = true;
    assignmentsBySession = next;
  }

  function onDragStartSession(sessionId: string, e: DragEvent) {
    draggedSessionId = sessionId;
    e.dataTransfer?.setData("text/plain", sessionId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }

  function onDropSlot(slotKey: string, e: DragEvent) {
    e.preventDefault();
    const sid = e.dataTransfer?.getData("text/plain") || draggedSessionId;
    if (!sid) return;

    // one session per slot and one slot per session
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(assignmentsBySession)) {
      if (k === sid) continue;
      if (v === slotKey) continue;
      next[k] = v;
    }
    next[sid] = slotKey;
    assignmentsBySession = next;
    draggedSessionId = null;
  }

  function clearAssignment(sessionId: string) {
    const next = { ...assignmentsBySession };
    delete next[sessionId];
    assignmentsBySession = next;
  }

  function scheduledPayloadJson(): string {
    const rows = unscheduledSessions
      .map((s) => {
        const slot = assignmentsBySession[s.id];
        if (!slot) return null;
        const localStart = new Date(`${slot}:00`);
        const duration = s.estimated_duration_minutes ?? 60;
        const localEnd = new Date(localStart.getTime() + duration * 60 * 1000);
        return {
          session_id: s.id,
          scheduled_start_at: localStart.toISOString(),
          scheduled_end_at: localEnd.toISOString(),
        };
      })
      .filter(Boolean);
    return JSON.stringify(rows);
  }
</script>

<div
  class={cn(
    "border-border bg-card relative min-w-[260px] max-w-[300px] rounded-2xl border px-3 py-3 text-left shadow-sm",
    done && "ring-primary/40 ring-2",
  )}
  class:opacity-80={done}
>
  <Handle
    type="target"
    position={Position.Top}
    class="!h-2 !w-2 !border-border !bg-muted"
  />

  <div class="flex items-start gap-2">
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-1.5">
        <p
          class="text-foreground text-sm leading-snug font-semibold tracking-tight"
          class:line-through={done}
        >
          {data.module.title}
        </p>
        {#if !data.module.parent_module_id}
          <Badge variant="secondary" class="text-[9px] tracking-wide uppercase"
            >Root</Badge
          >
        {/if}
      </div>
      {#if data.module.description}
        <p
          class="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed"
        >
          {data.module.description}
        </p>
      {/if}
    </div>
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="nodrag nopan h-8 shrink-0 gap-1 px-2 text-xs whitespace-nowrap"
      onclick={() => (sessionsDialogOpen = true)}
      title="View sessions for this module"
    >
      <ListIcon class="size-3.5 shrink-0" />
      Sessions
    </Button>
  </div>

  <div
    class="nodrag nopan mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-3"
  >
    <Button
      variant="outline"
      size="sm"
      class="h-8 gap-1 px-2 text-xs"
      href={resolve(`/programs/${data.programId}/edit`)}
      title="Edit program details and roadmap"
    >
      <PencilIcon class="size-3.5 shrink-0" />
      Edit
    </Button>

    {#if lifecycle === "pending"}
      <Button
        variant="secondary"
        size="sm"
        type="button"
        class="h-8 gap-1 px-2 text-xs"
        onclick={openStartDialog}
      >
          <PlayIcon class="size-3.5 shrink-0" />
          Start
      </Button>
    {:else}
      <form
        method="POST"
        action="?/toggleModuleComplete"
        use:enhance={completeEnhance}
        class="inline"
      >
        <input type="hidden" name="module_id" value={data.module.id} />
        <Button variant="secondary" size="sm" type="submit" class="h-8 gap-1 px-2 text-xs">
          {#if lifecycle === "completed"}
            <RotateCcwIcon class="size-3.5 shrink-0" />
            Reopen
          {:else}
            <CheckIcon class="size-3.5 shrink-0" />
            Complete
          {/if}
        </Button>
      </form>
    {/if}

    <form
      bind:this={deleteModuleFormEl}
      method="POST"
      action="?/deleteModule"
      use:enhance={deleteEnhance}
      class="inline"
    >
      <input type="hidden" name="module_id" value={data.module.id} />
      <Button
        variant="ghost"
        size="sm"
        type="button"
        class="text-destructive hover:text-destructive h-8 gap-1 px-2 text-xs"
        onclick={() => (moduleDeleteOpen = true)}
      >
        <Trash2Icon class="size-3.5 shrink-0" />
        Delete
      </Button>
    </form>
  </div>

  <DestructiveConfirmDialog
    open={moduleDeleteOpen}
    onOpenChange={(v) => (moduleDeleteOpen = v)}
    title="Remove module?"
    description={moduleDeleteDescription}
    confirmLabel="Remove"
    onConfirm={() => deleteModuleFormEl?.requestSubmit()}
  />

  <Dialog.Root bind:open={sessionsDialogOpen}>
    <Dialog.Content
      class="flex max-h-[min(85vh,40rem)] flex-col gap-4 overflow-hidden sm:max-w-lg"
    >
      <Dialog.Header>
        <Dialog.Title>Sessions — {data.module.title}</Dialog.Title>
        <Dialog.Description>
          Planned work for this module on the roadmap. Add or edit sessions in
          the full editor.
        </Dialog.Description>
      </Dialog.Header>
      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
        {#if data.sessions.length === 0}
          <p class="text-muted-foreground text-sm">No sessions yet.</p>
        {:else}
          <ul class="space-y-3">
            {#each data.sessions as s (s.id)}
              {@const sessionDone = s.status === "completed"}
              <li
                class="border-border/80 rounded-xl border px-3 py-3"
                class:opacity-75={sessionDone}
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="text-foreground text-sm font-medium"
                    class:line-through={sessionDone}>{s.name}</span
                  >
                  <Badge variant="secondary" class="text-xs capitalize">
                    {SESSION_TYPE_LABEL[s.session_type]}
                  </Badge>
                  <Badge variant="outline" class="text-xs">
                    {s.status.replace("_", " ")}
                  </Badge>
                </div>
                <p class="text-muted-foreground mt-1.5 tabular-nums text-xs">
                  {s.planned_start_date} → {s.planned_end_date}
                  {#if s.estimated_duration_minutes}
                    · ~{s.estimated_duration_minutes} min
                  {/if}
                </p>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <div class="border-border/80 flex flex-wrap gap-2 border-t pt-2">
        <Button
          variant="secondary"
          size="sm"
          class="w-full sm:w-auto"
          href={resolve(`/programs/${data.programId}/edit`)}
        >
          Open full editor
        </Button>
      </div>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={startScheduleDialogOpen}>
    <Dialog.Content class="flex max-h-[min(90vh,46rem)] flex-col gap-4 sm:max-w-5xl">
      <Dialog.Header>
        <Dialog.Title>Start module and schedule sessions</Dialog.Title>
        <Dialog.Description>
          Drag sessions into calendar slots, then save to start this module with
          explicit schedule times.
        </Dialog.Description>
      </Dialog.Header>

      <div class="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[320px,1fr]">
        <section class="border-border/80 min-h-0 overflow-y-auto rounded-xl border p-3">
          <p class="mb-2 text-sm font-medium">Sessions</p>
          {#if unscheduledSessions.length === 0}
            <p class="text-muted-foreground text-sm">
              No unscheduled sessions. You can still start this module.
            </p>
          {:else}
            <ul class="space-y-2">
              {#each unscheduledSessions as s (s.id)}
                <li
                  class="border-border/70 bg-muted/30 rounded-lg border px-2.5 py-2"
                  draggable="true"
                  ondragstart={(e) => onDragStartSession(s.id, e)}
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-sm font-medium">{s.name || "Untitled session"}</p>
                    <Badge variant="secondary" class="text-[10px]">
                      {s.estimated_duration_minutes ?? 60}m
                    </Badge>
                  </div>
                  <p class="text-muted-foreground mt-1 text-xs">
                    {assignmentsBySession[s.id]
                      ? `Assigned: ${calendarSlots.find((x) => x.key === assignmentsBySession[s.id])?.label ?? ""}`
                      : "Not assigned yet"}
                  </p>
                  {#if assignmentsBySession[s.id]}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      class="mt-1 h-6 px-1.5 text-xs"
                      onclick={() => clearAssignment(s.id)}
                    >
                      Clear
                    </Button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <section class="border-border/80 min-h-0 overflow-y-auto rounded-xl border p-3">
          <p class="mb-2 text-sm font-medium">Calendar slots (next 7 days)</p>
          <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {#each calendarSlots as slot (slot.key)}
              <div
                class="border-border/70 hover:bg-muted/40 rounded-lg border p-2"
                role="button"
                tabindex="0"
                aria-label={`Drop session to schedule at ${slot.label}`}
                ondragover={(e) => e.preventDefault()}
                ondrop={(e) => onDropSlot(slot.key, e)}
              >
                <p class="text-xs font-medium">{slot.label}</p>
                {#if slotToSession.has(slot.key)}
                  {@const sid = slotToSession.get(slot.key)}
                  {@const sess = unscheduledSessions.find((s) => s.id === sid)}
                  <p class="text-primary mt-1 text-xs">{sess?.name ?? "Assigned"}</p>
                {:else}
                  <p class="text-muted-foreground mt-1 text-xs">Drop session here</p>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      </div>

      <form
        method="POST"
        action="?/startModule"
        use:enhance={startEnhance}
        class="border-border/80 flex flex-wrap items-center justify-between gap-2 border-t pt-3"
      >
        <input type="hidden" name="module_id" value={data.module.id} />
        <input type="hidden" name="schedule_json" value={scheduledPayloadJson()} />
        <p class="text-muted-foreground text-xs">
          {#if allAssigned}
            Ready to start.
          {:else}
            Assign all sessions before saving.
          {/if}
        </p>
        <div class="flex items-center gap-2">
          <Button type="button" variant="outline" onclick={() => (startScheduleDialogOpen = false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!allAssigned}>Save schedule &amp; start</Button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <Handle
    type="source"
    position={Position.Bottom}
    class="!h-2 !w-2 !border-border !bg-muted"
  />
</div>
