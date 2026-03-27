<script lang="ts">
  import { resolve } from "$app/paths";
  import type { PageProps } from "./$types";
  import {
    Background,
    Controls,
    MiniMap,
    SvelteFlow,
    type Edge,
    type Node,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { Button } from "$lib/components/ui/button";
  import ModuleFlowNode from "$lib/components/learning/ModuleFlowNode.svelte";
  import { layoutModuleNodesForFlow } from "$lib/learning/moduleFlowLayout";
  import { mode } from "mode-watcher";

  /** Match xyflow to app theme (html `dark` from mode-watcher), not only `prefers-color-scheme`. */
  const flowColorMode = $derived.by((): "dark" | "light" | "system" => {
    const m = mode.current;
    if (m === "dark") return "dark";
    if (m === "light") return "light";
    return "system";
  });

  let { data }: PageProps = $props();

  const nodeTypes = { module: ModuleFlowNode };

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);

  $effect(() => {
    const program = data.program;
    const modules = data.modules;
    if (!program) {
      nodes = [];
      edges = [];
      return;
    }
    const { nodes: nextNodes, edges: nextEdges } = layoutModuleNodesForFlow(
      modules,
      {
        programId: program.id,
        userId: data.userId ?? "",
        sessionsByModule: data.sessionsByModule,
      },
    );
    nodes = nextNodes;
    edges = nextEdges;
  });
</script>

<div class="flex w-full flex-col gap-6">
  <p>
    <a
      href={resolve("/programs")}
      class="text-muted-foreground hover:text-foreground text-sm transition-colors"
      >← All programs</a
    >
  </p>

  {#if !data.program}
    <p
      class="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm"
      role="alert"
    >
      {data.loadError ?? "Program could not be loaded."}
    </p>
  {:else}
    {#if data.loadError}
      <p
        class="border-chart-4/40 bg-chart-4/10 text-foreground rounded-xl border px-4 py-3 text-sm"
        role="status"
      >
        Partial load: {data.loadError}
      </p>
    {/if}

    <header
      class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="min-w-0">
        <p
          class="text-primary mb-1 text-xs font-semibold tracking-widest uppercase"
        >
          Roadmap
        </p>
        <h1
          class="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl"
        >
          {data.program.name}
        </h1>
        {#if data.program.description}
          <p
            class="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed"
          >
            {data.program.description}
          </p>
        {/if}
        <p class="text-muted-foreground mt-2 max-w-2xl text-xs leading-relaxed">
          Arrows follow parent → child from the single program root.
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <Button variant="outline" size="sm" href={resolve(`/programs/${data.program.id}/edit`)}>
          Full editor
        </Button>
      </div>
    </header>

    <section
      class="border-border/70 bg-background relative w-full overflow-hidden rounded-2xl border"
      aria-label="Module roadmap canvas"
    >
      <div
        class="bg-background h-[min(24rem,52dvh)] w-full min-h-[18rem] sm:h-[min(30rem,58dvh)] sm:min-h-[22rem] lg:h-[min(36rem,65dvh)]"
      >
        {#if nodes.length === 0}
          <div
            class="text-muted-foreground bg-background flex h-full items-center justify-center px-6 text-center text-sm"
          >
            No modules yet. Use <strong class="text-foreground">Full editor</strong> to add
            your first module.
          </div>
        {:else}
          <SvelteFlow
            bind:nodes
            bind:edges
            {nodeTypes}
            colorMode={flowColorMode}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.35, minZoom: 0.2 }}
            minZoom={0.15}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            deleteKey={null}
            class="!bg-background h-full w-full"
            style="--background-color: var(--background);"
          >
            <Background gap={18} size={1} bgColor="var(--background)" />
            <Controls
              position="top-left"
              class="!m-2 overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-sm"
            />
            <MiniMap
              position="bottom-right"
              class="!m-2 overflow-hidden rounded-xl border border-border/80 bg-card/90"
            />
          </SvelteFlow>
        {/if}
      </div>
    </section>

  {/if}
</div>
