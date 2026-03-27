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
      { onSuccess: afterModuleMutation },
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
      <form method="POST" action="?/startModule" use:enhance={startEnhance} class="inline">
        <input type="hidden" name="module_id" value={data.module.id} />
        <Button variant="secondary" size="sm" type="submit" class="h-8 gap-1 px-2 text-xs">
          <PlayIcon class="size-3.5 shrink-0" />
          Start
        </Button>
      </form>
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

  <Handle
    type="source"
    position={Position.Bottom}
    class="!h-2 !w-2 !border-border !bg-muted"
  />
</div>
