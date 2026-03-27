<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import DestructiveConfirmDialog from "$lib/components/destructive-confirm-dialog.svelte";
  import SessionScheduleDateField from "$lib/components/learning/session-schedule-date-field.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { createDefaultSessionDraft } from "$lib/learning/roadmapDraft";
  import { SESSION_TYPE_LABEL } from "$lib/learning/sessionLabels";
  import type {
    LearningModuleRow,
    LearningSessionRow,
  } from "$lib/learning/types";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import PlayIcon from "@lucide/svelte/icons/play";
  import CheckIcon from "@lucide/svelte/icons/check";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import { cn } from "$lib/utils.js";

  const SESSION_TYPE_ITEMS = [
    { value: "study", label: "Study" },
    { value: "drill", label: "Drill" },
    { value: "project", label: "Project" },
    { value: "test", label: "Test" },
    { value: "flashcard_session", label: "Flashcard session" },
  ] as const;

  type ModuleEditorNodeData = {
    module: LearningModuleRow;
    sessions: LearningSessionRow[];
    todayIso: string;
    onUpdateModule: (id: string, patch: Partial<LearningModuleRow>) => void;
    onRemoveModule: (id: string) => void;
    onUpdateSession: (id: string, patch: Partial<LearningSessionRow>) => void;
    onRemoveSession: (id: string) => void;
    onAddSession: (moduleId: string, session: LearningSessionRow) => void;
  };

  let { data }: NodeProps & { data: ModuleEditorNodeData } = $props();

  let moduleDeleteOpen = $state(false);

  let addSessionOpen = $state(false);
  let addForm = $state<LearningSessionRow | null>(null);

  let editSessionOpen = $state(false);
  let editSessionId = $state<string | null>(null);
  let editForm = $state<LearningSessionRow | null>(null);

  let deleteSessionId = $state<string | null>(null);

  const done = $derived(!!data.module.completed_at);
  const lifecycle = $derived.by(() => {
    if (data.module.completed_at || data.module.module_state === "completed") {
      return "completed" as const;
    }
    if (data.module.module_state === "started") return "started" as const;
    return "pending" as const;
  });

  function advanceModuleLifecycle() {
    if (lifecycle === "pending") {
      data.onUpdateModule(data.module.id, {
        module_state: "started",
        started_at: data.module.started_at ?? new Date().toISOString(),
        completed_at: null,
      });
      return;
    }
    if (lifecycle === "started") {
      data.onUpdateModule(data.module.id, {
        module_state: "completed",
        completed_at: new Date().toISOString(),
        started_at: data.module.started_at ?? new Date().toISOString(),
      });
      return;
    }
    data.onUpdateModule(data.module.id, {
      module_state: "pending",
      started_at: null,
      completed_at: null,
    });
  }

  const moduleDeleteDescription = $derived(
    !data.module.parent_module_id
      ? "Delete the root module? This removes every sub-module and their sessions from the draft."
      : "Remove this module and its sessions from the draft?",
  );

  const editingSession = $derived(
    editSessionId
      ? (data.sessions.find((s) => s.id === editSessionId) ?? null)
      : null,
  );

  function openAddSession() {
    addForm = createDefaultSessionDraft(
      data.module.id,
      data.todayIso,
      data.sessions.length,
    );
    addSessionOpen = true;
  }

  function saveAddSession() {
    if (!addForm?.name.trim()) return;
    data.onAddSession(data.module.id, addForm);
    addSessionOpen = false;
    addForm = null;
  }

  function openEditSession(id: string) {
    const s = data.sessions.find((x) => x.id === id);
    if (!s) return;
    editSessionId = id;
    editForm = { ...s };
    editSessionOpen = true;
  }

  function saveEditSession() {
    if (!editForm || !editSessionId) return;
    if (!editForm.name.trim()) return;
    data.onUpdateSession(editSessionId, {
      name: editForm.name,
      session_type: editForm.session_type,
      planned_start_date: editForm.planned_start_date,
      planned_end_date: editForm.planned_end_date,
      estimated_duration_minutes: editForm.estimated_duration_minutes,
      status: editForm.status,
      actual_completed_at: editForm.actual_completed_at,
      notes: editForm.notes,
    });
    editSessionOpen = false;
    editSessionId = null;
    editForm = null;
  }

  const editSessionDone = $derived(
    editForm ? editForm.status === "completed" : false,
  );
</script>

<div
  class={cn(
    "border-border bg-card nodrag nopan relative flex max-h-[min(26rem,70dvh)] w-[min(100%,320px)] flex-col overflow-hidden rounded-2xl border px-3 py-3 text-left shadow-sm",
    done && "ring-primary/40 ring-2",
  )}
  class:opacity-90={done}
>
  <Handle
    type="target"
    position={Position.Top}
    class="!h-2 !w-2 !border-border !bg-muted"
  />

  <div class="flex min-h-0 min-w-0 flex-1 flex-col pr-0.5">
    <div class="shrink-0 space-y-3">
      <div class="flex flex-col gap-1.5">
        <label
          class="text-foreground text-sm font-medium"
          for={`mod-title-${data.module.id}`}>Title</label
        >
        <div class="flex flex-wrap items-center gap-1.5">
          <Input
            id={`mod-title-${data.module.id}`}
            class="h-8 min-w-0 flex-1 text-sm font-semibold"
            value={data.module.title}
            maxlength={200}
            placeholder="Module title"
            oninput={(e) =>
              data.onUpdateModule(data.module.id, {
                title: e.currentTarget.value,
              })}
          />
          {#if !data.module.parent_module_id}
            <Badge
              variant="secondary"
              class="text-[9px] tracking-wide uppercase">Root</Badge
            >
          {/if}
          {#if lifecycle === "completed"}
            <Badge variant="default" class="text-[9px] tracking-wide uppercase">Completed</Badge>
          {:else if lifecycle === "started"}
            <Badge variant="outline" class="text-[9px] tracking-wide uppercase">Started</Badge>
          {:else}
            <Badge variant="outline" class="text-[9px] tracking-wide uppercase">Pending</Badge>
          {/if}
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <label
          class="text-foreground text-sm font-medium"
          for={`mod-desc-${data.module.id}`}>Description</label
        >
        <textarea
          id={`mod-desc-${data.module.id}`}
          value={data.module.description ?? ""}
          maxlength={4000}
          rows={2}
          placeholder="Optional"
          class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[3rem] w-full resize-y rounded-xl border px-2 py-1.5 text-xs focus-visible:ring-[3px] focus-visible:outline-none"
          oninput={(e) =>
            data.onUpdateModule(data.module.id, {
              description: e.currentTarget.value.trim()
                ? e.currentTarget.value
                : null,
            })}
        ></textarea>
      </div>
    </div>

    <div
      class="mt-3 flex min-h-0 min-w-0 flex-1 flex-col border-t border-border/60 pt-3"
    >
      <div class="mb-2 flex shrink-0 items-center justify-between gap-2">
        <p class="text-foreground text-xs font-medium">Sessions</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="h-7 shrink-0 text-xs"
          onclick={openAddSession}
        >
          Add session
        </Button>
      </div>

      <div class="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {#if data.sessions.length === 0}
          <p class="text-muted-foreground text-xs">No sessions yet.</p>
        {:else}
          <ul class="space-y-1">
            {#each data.sessions as s (s.id)}
              {@const sessionDone = s.status === "completed"}
              <li
                class="border-border/70 bg-muted/30 flex items-center gap-1.5 rounded-lg border px-2 py-1.5"
                class:opacity-70={sessionDone}
              >
                <div class="min-w-0 flex-1">
                  <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span
                      class="text-foreground truncate text-xs font-medium"
                      class:line-through={sessionDone}
                    >
                      {s.name || "Untitled session"}
                    </span>
                    <span
                      class="bg-primary text-primary-foreground shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                    >
                      {SESSION_TYPE_LABEL[s.session_type]}
                    </span>
                  </div>
                </div>
                <div class="nodrag nopan flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="text-foreground h-7 w-7"
                    title="Edit session"
                    onclick={() => openEditSession(s.id)}
                  >
                    <PencilIcon class="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="text-destructive hover:text-destructive h-7 w-7"
                    title="Delete session"
                    onclick={() => (deleteSessionId = s.id)}
                  >
                    <Trash2Icon class="size-3.5" />
                  </Button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>

  <footer
    class="border-border/60 nodrag nopan mt-2 flex shrink-0 flex-wrap gap-1.5 border-t pt-3"
  >
    <div class="ml-auto">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        class="h-7 text-xs"
        onclick={advanceModuleLifecycle}
      >
        {#if lifecycle === "completed"}
          <RotateCcwIcon class="mr-1 size-3" />
          Reopen
        {:else if lifecycle === "started"}
          <CheckIcon class="mr-1 size-3" />
          Complete
        {:else}
          <PlayIcon class="mr-1 size-3" />
          Start
        {/if}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="text-destructive hover:text-destructive h-7 text-xs"
        onclick={() => (moduleDeleteOpen = true)}
      >
        <Trash2Icon class="mr-1 size-3" />
        Remove
      </Button>
    </div>
  </footer>

  <Handle
    type="source"
    position={Position.Bottom}
    class="!h-2 !w-2 !border-border !bg-muted"
  />
</div>

<Dialog.Root bind:open={addSessionOpen}>
  <Dialog.Content class="max-h-[min(85vh,32rem)] overflow-y-auto sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>New session</Dialog.Title>
      <Dialog.Description>
        Schedule work for this module. Save the roadmap when you are done
        editing.
      </Dialog.Description>
    </Dialog.Header>
    {#if addForm}
      <div class="flex flex-col gap-3 pt-1">
        <div class="flex flex-col gap-1.5">
          <label class="text-foreground text-sm font-medium" for="add-sess-name"
            >Name</label
          >
          <Input
            id="add-sess-name"
            bind:value={addForm.name}
            maxlength={200}
            placeholder="Session name"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-foreground text-sm font-medium">Type</span>
          <select
            class="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            bind:value={addForm.session_type}
          >
            {#each SESSION_TYPE_ITEMS as st (st.value)}
              <option value={st.value}>{st.label}</option>
            {/each}
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <SessionScheduleDateField
            id="add-ps"
            label="Planned start"
            isoValue={addForm.planned_start_date}
            onIsoChange={(iso) => {
              if (addForm) addForm = { ...addForm, planned_start_date: iso };
            }}
          />
          <SessionScheduleDateField
            id="add-pe"
            label="Planned end"
            isoValue={addForm.planned_end_date}
            onIsoChange={(iso) => {
              if (addForm) addForm = { ...addForm, planned_end_date: iso };
            }}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-foreground text-sm font-medium" for="add-sess-min"
            >Est. minutes (optional)</label
          >
          <Input
            id="add-sess-min"
            type="number"
            min={1}
            value={addForm.estimated_duration_minutes ?? ""}
            placeholder="Minutes"
            oninput={(e) => {
              const v = e.currentTarget.value;
              if (addForm) {
                addForm = {
                  ...addForm,
                  estimated_duration_minutes: v
                    ? Math.max(1, parseInt(v, 10) || 0)
                    : null,
                };
              }
            }}
          />
        </div>
        <div class="flex flex-wrap justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onclick={() => {
              addSessionOpen = false;
              addForm = null;
            }}
          >
            Cancel
          </Button>
          <Button type="button" onclick={saveAddSession}>Add session</Button>
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={editSessionOpen}>
  <Dialog.Content class="max-h-[min(85vh,32rem)] overflow-y-auto sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Edit session</Dialog.Title>
      <Dialog.Description>
        {editingSession?.name ?? "Session"} — {editingSession
          ? SESSION_TYPE_LABEL[editingSession.session_type]
          : ""}
      </Dialog.Description>
    </Dialog.Header>
    {#if editForm}
      <div class="flex flex-col gap-3 pt-1">
        <div class="flex flex-col gap-1.5">
          <label
            class="text-foreground text-sm font-medium"
            for="edit-sess-name">Name</label
          >
          <Input
            id="edit-sess-name"
            bind:value={editForm.name}
            maxlength={200}
            placeholder="Session name"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-foreground text-sm font-medium">Type</span>
          <select
            class="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            bind:value={editForm.session_type}
          >
            {#each SESSION_TYPE_ITEMS as st (st.value)}
              <option value={st.value}>{st.label}</option>
            {/each}
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <SessionScheduleDateField
            id="edit-ps"
            label="Planned start"
            isoValue={editForm.planned_start_date}
            onIsoChange={(iso) => {
              if (editForm) editForm = { ...editForm, planned_start_date: iso };
            }}
          />
          <SessionScheduleDateField
            id="edit-pe"
            label="Planned end"
            isoValue={editForm.planned_end_date}
            onIsoChange={(iso) => {
              if (editForm) editForm = { ...editForm, planned_end_date: iso };
            }}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-foreground text-sm font-medium" for="edit-sess-min"
            >Est. minutes (optional)</label
          >
          <Input
            id="edit-sess-min"
            type="number"
            min={1}
            value={editForm.estimated_duration_minutes ?? ""}
            placeholder="Minutes"
            oninput={(e) => {
              const v = e.currentTarget.value;
              if (editForm) {
                editForm = {
                  ...editForm,
                  estimated_duration_minutes: v
                    ? Math.max(1, parseInt(v, 10) || 0)
                    : null,
                };
              }
            }}
          />
        </div>
        <div class="flex flex-wrap gap-2 border-t border-border/60 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            class="text-xs"
            onclick={() => {
              if (!editForm) return;
              const done = editForm.status === "completed";
              editForm = {
                ...editForm,
                status: done ? "planned" : "completed",
                actual_completed_at: done ? null : new Date().toISOString(),
              };
            }}
          >
            {#if editSessionDone}
              <RotateCcwIcon class="mr-1 size-3" />
              Reopen session
            {:else}
              <CheckIcon class="mr-1 size-3" />
              Mark done
            {/if}
          </Button>
        </div>
        <div class="flex flex-wrap justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onclick={() => {
              editSessionOpen = false;
              editSessionId = null;
              editForm = null;
            }}
          >
            Cancel
          </Button>
          <Button type="button" onclick={saveEditSession}>Save</Button>
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<DestructiveConfirmDialog
  open={deleteSessionId !== null}
  onOpenChange={(v) => {
    if (!v) deleteSessionId = null;
  }}
  title="Remove session?"
  description="Remove this session from the module? You can undo by saving before leaving the roadmap editor."
  confirmLabel="Remove"
  onConfirm={() => {
    const id = deleteSessionId;
    if (id) data.onRemoveSession(id);
    deleteSessionId = null;
  }}
/>

<DestructiveConfirmDialog
  open={moduleDeleteOpen}
  onOpenChange={(v) => (moduleDeleteOpen = v)}
  title="Remove module?"
  description={moduleDeleteDescription}
  confirmLabel="Remove"
  onConfirm={() => {
    data.onRemoveModule(data.module.id);
    moduleDeleteOpen = false;
  }}
/>
