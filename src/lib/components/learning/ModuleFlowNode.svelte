<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    clearProgramBundleCache,
    clearProgramListCache,
  } from "$lib/cache/learningDataCache";
  import type { LearningModuleRow } from "$lib/learning/types";
  import CheckIcon from "@lucide/svelte/icons/check";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { cn } from "$lib/utils.js";

  type ModuleNodeData = {
    module: LearningModuleRow;
    programId: string;
    userId: string;
  };

  let { data }: NodeProps & { data: ModuleNodeData } = $props();

  function flowActionEnhance() {
    return () =>
      async ({
        result,
        update,
      }: {
        result: { type: string };
        update: () => Promise<void>;
      }) => {
        if (
          (result.type === "success" || result.type === "redirect") &&
          data.userId
        ) {
          clearProgramListCache(data.userId);
          clearProgramBundleCache(data.userId, data.programId);
          await invalidate("app:learning:list");
          await invalidate(`app:learning:program:${data.programId}`);
        }
        await update();
      };
  }

  const done = $derived(!!data.module.completed_at);
</script>

<div
  class={cn(
    "border-border bg-card relative min-w-[220px] max-w-[260px] rounded-2xl border px-3 py-3 text-left shadow-sm",
    done && "ring-primary/40 ring-2",
  )}
  class:opacity-80={done}
>
  <Handle
    type="target"
    position={Position.Top}
    class="!h-2 !w-2 !border-border !bg-muted"
  />

  <div class="flex flex-wrap items-center gap-1.5 pr-1">
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
    <p class="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
      {data.module.description}
    </p>
  {/if}

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

    <form
      method="POST"
      action="?/toggleModuleComplete"
      use:enhance={flowActionEnhance()}
      class="inline"
    >
      <input type="hidden" name="module_id" value={data.module.id} />
      <Button variant="secondary" size="sm" type="submit" class="h-8 gap-1 px-2 text-xs">
        {#if done}
          <RotateCcwIcon class="size-3.5 shrink-0" />
          Reopen
        {:else}
          <CheckIcon class="size-3.5 shrink-0" />
          Done
        {/if}
      </Button>
    </form>

    <form
      method="POST"
      action="?/deleteModule"
      use:enhance={flowActionEnhance()}
      class="inline"
      onsubmit={(e) => {
        if (!confirm("Remove this module and all of its sessions?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="module_id" value={data.module.id} />
      <Button
        variant="ghost"
        size="sm"
        type="submit"
        class="text-destructive hover:text-destructive h-8 gap-1 px-2 text-xs"
      >
        <Trash2Icon class="size-3.5 shrink-0" />
        Delete
      </Button>
    </form>
  </div>

  <Handle
    type="source"
    position={Position.Bottom}
    class="!h-2 !w-2 !border-border !bg-muted"
  />
</div>
