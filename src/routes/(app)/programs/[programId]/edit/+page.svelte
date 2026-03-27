<script lang="ts">
  import { resolve } from "$app/paths";
  import { enhance } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import {
    Background,
    Controls,
    MiniMap,
    Panel,
    SvelteFlow,
    type Connection,
    type Edge,
    type Node,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { mode } from "mode-watcher";
  import {
    clearProgramBundleCache,
    clearProgramListCache,
  } from "$lib/cache/learningDataCache";
  import ModuleEditorFlowNode from "$lib/components/learning/ModuleEditorFlowNode.svelte";
  import { dbActionToastEnhance } from "$lib/forms/dbActionToastEnhance";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import DestructiveConfirmDialog from "$lib/components/destructive-confirm-dialog.svelte";
  import { requestSubmitFormById } from "$lib/dom/form";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import DatePopoverField from "$lib/components/date-popover-field.svelte";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import * as Dialog from "$lib/components/ui/dialog";
  import type { PageProps } from "./$types";
  import {
    layoutModuleNodesForFlowEditor,
    modulesInTreeOrder,
  } from "$lib/learning/moduleFlowLayout";
  import {
    cloneRoadmapFromData,
    collectDescendantModuleIds,
    newTempModuleId,
    reindexModuleSortOrders,
    reindexSessionSortOrders,
    snapshotPayloadJson,
    validateRoadmapTree,
  } from "$lib/learning/roadmapDraft";
  import type {
    LearningModuleRow,
    LearningSessionRow,
    MetalearningResourceRow,
    ProgramFlashcardRow,
    ProgramWeaknessRow,
  } from "$lib/learning/types";
  import { isUuid } from "$lib/learning/uuid";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import { parseDate, type CalendarDate } from "@internationalized/date";

  let { data, form, params }: PageProps = $props();

  const SESSION_TYPE_ITEMS = [
    { value: "study", label: "Study" },
    { value: "drill", label: "Drill" },
    { value: "project", label: "Project" },
    { value: "test", label: "Test" },
    { value: "flashcard_session", label: "Flashcard session" },
  ] as const;

  const RESOURCE_KIND_ITEMS = [
    { value: "link", label: "Link" },
    { value: "document", label: "Document" },
    { value: "picture", label: "Picture" },
  ] as const;

  const flowColorMode = $derived.by((): "dark" | "light" | "system" => {
    const m = mode.current;
    if (m === "dark") return "dark";
    if (m === "light") return "light";
    return "system";
  });

  let roadmapDirty = $state(false);
  let draftModules = $state<LearningModuleRow[]>([]);
  let draftSessionsByModule = $state<Record<string, LearningSessionRow[]>>({});
  let saveRoadmapFormEl: HTMLFormElement | undefined = $state();

  let targetStartCalendar = $state<CalendarDate | undefined>();
  let targetEndCalendar = $state<CalendarDate | undefined>();
  let newModuleParentId = $state("");
  let newModuleTitle = $state("");
  let newModuleDescription = $state("");
  let addResourceKind = $state("link");
  let editTab = $state("roadmap");

  const parentModuleSelectItems = $derived(
    draftModules.length > 0
      ? [
          { value: "", label: "Under program root (default)" },
          ...modulesInTreeOrder(draftModules).map((m) => ({
            value: m.id,
            label: `${m.title}${!m.parent_module_id ? " — root" : ""}`,
          })),
        ]
      : [],
  );

  const parentModuleTriggerLabel = $derived(
    parentModuleSelectItems.find((i) => i.value === newModuleParentId)
      ?.label ?? "Under program root (default)",
  );

  const addResourceKindLabel = $derived(
    RESOURCE_KIND_ITEMS.find((i) => i.value === addResourceKind)?.label ??
      "Link",
  );

  let editResourceKind = $state("link");
  const editResourceKindLabel = $derived(
    RESOURCE_KIND_ITEMS.find((i) => i.value === editResourceKind)?.label ??
      "Link",
  );


  $effect.pre(() => {
    if (!roadmapDirty && data.program) {
      const c = cloneRoadmapFromData(data.modules, data.sessionsByModule);
      draftModules = c.modules;
      draftSessionsByModule = c.sessionsByModule;
    }
  });

  const roadmapPayloadJson = $derived(
    snapshotPayloadJson(
      reindexModuleSortOrders(draftModules),
      reindexSessionSortOrders(draftSessionsByModule),
    ),
  );

  const nodeTypes = { moduleEditor: ModuleEditorFlowNode };

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);

  function updateDraftModule(id: string, patch: Partial<LearningModuleRow>) {
    roadmapDirty = true;
    draftModules = draftModules.map((m) =>
      m.id === id ? { ...m, ...patch } : m,
    );
  }

  function parentSelectItemsForModule(moduleId: string): {
    value: string;
    label: string;
  }[] {
    if (draftModules.length === 0) return [];
    const forbidden = new Set([
      moduleId,
      ...collectDescendantModuleIds(draftModules, moduleId),
    ]);
    const items: { value: string; label: string }[] = [
      { value: "", label: "Under program root (default)" },
    ];
    for (const m of modulesInTreeOrder(draftModules)) {
      if (forbidden.has(m.id)) continue;
      items.push({
        value: m.id,
        label: `${m.title}${!m.parent_module_id ? " — root" : ""}`,
      });
    }
    return items;
  }

  function setDraftModuleParent(moduleId: string, parentValue: string) {
    const root = draftModules.find((m) => !m.parent_module_id);
    if (!root || moduleId === root.id) return;

    const raw = parentValue.trim();
    let newParent: string;
    if (raw === "" || raw === root.id) {
      newParent = root.id;
    } else if (draftModules.some((m) => m.id === raw)) {
      newParent = raw;
    } else {
      return;
    }

    if (newParent === moduleId) return;
    if (wouldCreateCycle(newParent, moduleId)) return;

    const cur = draftModules.find((m) => m.id === moduleId);
    if (!cur || cur.parent_module_id === newParent) return;

    roadmapDirty = true;
    draftModules = reindexModuleSortOrders(
      draftModules.map((m) =>
        m.id === moduleId ? { ...m, parent_module_id: newParent } : m,
      ),
    );
  }

  function removeDraftModuleTree(id: string) {
    const descend = collectDescendantModuleIds(draftModules, id);
    const remove = new Set([id, ...descend]);
    roadmapDirty = true;
    draftModules = draftModules.filter((m) => !remove.has(m.id));
    const nextSess = { ...draftSessionsByModule };
    for (const mid of remove) {
      delete nextSess[mid];
    }
    draftSessionsByModule = nextSess;
  }

  function updateDraftSession(sid: string, patch: Partial<LearningSessionRow>) {
    roadmapDirty = true;
    draftSessionsByModule = Object.fromEntries(
      Object.entries(draftSessionsByModule).map(([mid, list]) => [
        mid,
        list.map((s) => (s.id === sid ? { ...s, ...patch } : s)),
      ]),
    );
  }

  function removeDraftSession(sid: string) {
    roadmapDirty = true;
    draftSessionsByModule = Object.fromEntries(
      Object.entries(draftSessionsByModule).map(([mid, list]) => [
        mid,
        list.filter((s) => s.id !== sid),
      ]),
    );
  }

  function addDraftSession(moduleId: string, session: LearningSessionRow) {
    const list = draftSessionsByModule[moduleId] ?? [];
    roadmapDirty = true;
    draftSessionsByModule = {
      ...draftSessionsByModule,
      [moduleId]: [...list, session],
    };
  }

  function wouldCreateCycle(source: string, target: string): boolean {
    const byId = new Map(draftModules.map((m) => [m.id, m]));
    let cur: string | null | undefined = source;
    for (let i = 0; i < draftModules.length + 2; i++) {
      if (cur === target) return true;
      const row: LearningModuleRow | undefined = cur ? byId.get(cur) : undefined;
      if (!row?.parent_module_id) break;
      cur = row.parent_module_id;
    }
    return false;
  }

  function handleRoadmapConnect(c: Connection) {
    if (!c.source || !c.target) return;
    if (c.source === c.target) return;
    if (wouldCreateCycle(c.source, c.target)) return;
    roadmapDirty = true;
    draftModules = reindexModuleSortOrders(
      draftModules.map((m) =>
        m.id === c.target ? { ...m, parent_module_id: c.source } : m,
      ),
    );
  }

  function handleRoadmapDelete({
    edges: delEdges,
  }: {
    edges: Edge[];
    nodes: Node[];
  }) {
    const rootId = draftModules.find((m) => !m.parent_module_id)?.id;
    if (!rootId) return;
    for (const e of delEdges) {
      roadmapDirty = true;
      draftModules = reindexModuleSortOrders(
        draftModules.map((m) =>
          m.id === e.target ? { ...m, parent_module_id: rootId } : m,
        ),
      );
    }
  }

  function isValidRoadmapConnection(conn: Connection | Edge): boolean {
    if (conn.source === conn.target) return false;
    return !wouldCreateCycle(conn.source, conn.target);
  }

  $effect(() => {
    const program = data.program;
    const modules = draftModules;
    const sessionsByModule = draftSessionsByModule;
    if (!program || modules.length === 0) {
      nodes = [];
      edges = [];
      return;
    }
    const { nodes: rawNodes, edges: rawEdges } = layoutModuleNodesForFlowEditor(
      modules,
      {
        programId: program.id,
        userId: data.userId ?? "",
        sessionsByModule,
      },
    );
    const rootModuleId = modules.find((m) => !m.parent_module_id)?.id ?? "";
    nodes = rawNodes.map((n) => {
      const row = n.data.module as LearningModuleRow;
      const mid = row.id;
      const isRootModule = !row.parent_module_id;
      return {
        ...n,
        deletable: false,
        type: "moduleEditor",
        data: {
          programId: params.programId,
          module: row,
          sessions: n.data.sessions as LearningSessionRow[],
          todayIso: data.todayIso,
          rootModuleId,
          isRootModule,
          parentSelectItems: isRootModule ? [] : parentSelectItemsForModule(mid),
          onSetModuleParent: (parentValue: string) =>
            setDraftModuleParent(mid, parentValue),
          onUpdateModule: updateDraftModule,
          onRemoveModule: removeDraftModuleTree,
          onUpdateSession: updateDraftSession,
          onRemoveSession: removeDraftSession,
          onAddSession: addDraftSession,
        },
      };
    });
    edges = rawEdges;
  });

  function addModuleFromDialog() {
    const title = newModuleTitle.trim();
    if (!title) return;
    const id = newTempModuleId();
    let parent_module_id: string | null = null;
    if (draftModules.length > 0) {
      const raw = newModuleParentId.trim();
      if (isUuid(raw) && draftModules.some((m) => m.id === raw)) {
        parent_module_id = raw;
      } else {
        parent_module_id =
          draftModules.find((m) => !m.parent_module_id)?.id ?? null;
      }
    }
    const sort_order = draftModules.length;
    roadmapDirty = true;
    draftModules = [
      ...draftModules,
      {
        id,
        learning_program_id: params.programId,
        parent_module_id,
        title,
        description: newModuleDescription.trim()
          ? newModuleDescription.trim()
          : null,
        sort_order,
        module_state: "pending",
        started_at: null,
        completed_at: null,
        created_at: "",
        updated_at: "",
      },
    ];
    draftSessionsByModule = { ...draftSessionsByModule, [id]: [] };
    draftModules = reindexModuleSortOrders(draftModules);
    newModuleTitle = "";
    newModuleDescription = "";
    newModuleDialogOpen = false;
  }

  let programReason = $state<"instrumental" | "intrinsic">("intrinsic");
  let aiBusy = $state(false);
  let pendingAction = $state<string | null>(null);

  let deleteProgramDialogOpen = $state(false);
  let deleteProgramFormEl: HTMLFormElement | undefined = $state();

  let pendingWeaknessDeleteId = $state<string | null>(null);
  let pendingFlashcardDeleteId = $state<string | null>(null);
  let pendingResourceDeleteId = $state<string | null>(null);
  let newModuleDialogOpen = $state(false);

  let addWeaknessOpen = $state(false);
  let addFlashcardOpen = $state(false);
  let addResourceOpen = $state(false);
  let addWeaknessTitle = $state("");
  let addWeaknessDescription = $state("");
  let addWeaknessPriority = $state("0");
  let addFlashcardFront = $state("");
  let addFlashcardBack = $state("");
  let addResourceTitle = $state("");
  let addResourceUri = $state("");
  let addResourceDescription = $state("");

  let editWeaknessId = $state<string | null>(null);
  let editWeaknessTitle = $state("");
  let editWeaknessDescription = $state("");
  let editWeaknessPriority = $state("0");
  let editFlashcardId = $state<string | null>(null);
  let editFlashcardFront = $state("");
  let editFlashcardBack = $state("");
  let editResourceId = $state<string | null>(null);
  let editResourceTitle = $state("");
  let editResourceUri = $state("");
  let editResourceDescription = $state("");

  function openAddWeaknessDialog() {
    addWeaknessTitle = "";
    addWeaknessDescription = "";
    addWeaknessPriority = "0";
    addWeaknessOpen = true;
  }

  function openEditWeakness(w: ProgramWeaknessRow) {
    editWeaknessId = w.id;
    editWeaknessTitle = w.title;
    editWeaknessDescription = w.description ?? "";
    editWeaknessPriority = String(w.priority);
  }

  function openAddFlashcardDialog() {
    addFlashcardFront = "";
    addFlashcardBack = "";
    addFlashcardOpen = true;
  }

  function openEditFlashcard(c: ProgramFlashcardRow) {
    editFlashcardId = c.id;
    editFlashcardFront = c.front_text;
    editFlashcardBack = c.back_text;
  }

  function openAddResourceDialog() {
    addResourceKind = "link";
    addResourceTitle = "";
    addResourceUri = "";
    addResourceDescription = "";
    addResourceOpen = true;
  }

  function openEditResource(r: MetalearningResourceRow) {
    editResourceId = r.id;
    editResourceKind = r.kind;
    editResourceTitle = r.title;
    editResourceUri = r.uri;
    editResourceDescription = r.description ?? "";
  }

  $effect(() => {
    const pr = data.program;
    if (pr) programReason = pr.reason;
  });

  $effect(() => {
    const p = data.program;
    if (!p) return;
    targetStartCalendar = p.target_start_date
      ? parseDate(p.target_start_date)
      : undefined;
    targetEndCalendar = p.target_end_date
      ? parseDate(p.target_end_date)
      : undefined;
  });

  async function afterProgramMutation() {
    if (data.userId == null) return;
    clearProgramListCache(data.userId);
    clearProgramBundleCache(data.userId, params.programId);
    await invalidate("app:learning:list");
    await invalidate(`app:learning:program:${params.programId}`);
    await invalidate("app:learning:calendar");
  }

  function dbActionToast(
    pendingMessage: string,
    successMessage: string,
    options?: {
      actionKey?: string;
      onStart?: () => void;
      onDone?: () => void;
      onSuccessExtra?: () => void | Promise<void>;
    },
  ) {
    const { actionKey, onStart, onDone, onSuccessExtra } = options ?? {};
    return dbActionToastEnhance(pendingMessage, successMessage, {
      onStart: () => {
        if (actionKey) pendingAction = actionKey;
        onStart?.();
      },
      onDone: () => {
        if (actionKey) pendingAction = null;
        onDone?.();
      },
      onSuccess: async () => {
        await afterProgramMutation();
        await onSuccessExtra?.();
      },
    });
  }
</script>

<main class="flex flex-col gap-8 pb-16">
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

    {#if form?.message}
      <p
        class="rounded-xl border px-4 py-3 text-sm {form.success
          ? 'border-primary/25 bg-primary/10 text-foreground'
          : 'border-destructive/30 bg-destructive/5 text-destructive'}"
        role={form.success ? "status" : "alert"}
      >
        {form.message}
      </p>
    {/if}

    <header
      class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div>
        <h1
          class="text-foreground text-3xl font-semibold tracking-tight md:text-4xl"
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
      </div>
      <form
        bind:this={deleteProgramFormEl}
        method="POST"
        action="?/deleteProgram"
        class="shrink-0"
        use:enhance={dbActionToast("Deleting program...", "Program deleted.", {
          actionKey: "deleteProgram",
        })}
      >
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={pendingAction === "deleteProgram"}
          onclick={() => (deleteProgramDialogOpen = true)}
        >
          {pendingAction === "deleteProgram" ? "Deleting…" : "Delete program"}
        </Button>
      </form>
    </header>

    <Card>
      <CardHeader>
        <CardTitle class="text-lg">Program details</CardTitle>
        <CardDescription
          >Starting point, motivation, and target window.</CardDescription
        >
      </CardHeader>
      <CardContent>
        <form
          method="POST"
          action="?/updateProgram"
          class="flex flex-col gap-4"
          use:enhance={dbActionToast("Saving program...", "Program saved.", {
            actionKey: "updateProgram",
          })}
        >
          <div class="flex flex-col gap-1.5">
            <label for="name" class="text-sm font-medium">Name</label>
            <Input
              id="name"
              name="name"
              required
              maxlength={200}
              value={data.program.name}
            />
          </div>

          <fieldset class="flex flex-col gap-1.5 border-0 p-0">
            <legend class="text-sm font-medium">Reason to learn</legend>
            <ToggleGroup.Root
              type="single"
              bind:value={programReason}
              variant="outline"
              spacing={0}
              class="w-full max-w-md justify-stretch"
            >
              <ToggleGroup.Item value="intrinsic" class="flex-1"
                >Intrinsic</ToggleGroup.Item
              >
              <ToggleGroup.Item value="instrumental" class="flex-1"
                >Instrumental</ToggleGroup.Item
              >
            </ToggleGroup.Root>
            <input type="hidden" name="reason" value={programReason} />
          </fieldset>

          <div class="flex flex-col gap-1.5">
            <label for="reason_description" class="text-sm font-medium"
              >Why (short)</label
            >
            <textarea
              id="reason_description"
              name="reason_description"
              rows={2}
              maxlength={2000}
              class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
              >{data.program.reason_description ?? ""}</textarea
            >
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="description" class="text-sm font-medium"
              >Description</label
            >
            <textarea
              id="description"
              name="description"
              rows={2}
              maxlength={4000}
              class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
              >{data.program.description ?? ""}</textarea
            >
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="starting_point_description" class="text-sm font-medium"
              >Starting point</label
            >
            <textarea
              id="starting_point_description"
              name="starting_point_description"
              rows={3}
              maxlength={4000}
              class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[5rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
              >{data.program.starting_point_description ?? ""}</textarea
            >
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <DatePopoverField
              id="target_start_date"
              label="Target start"
              name="target_start_date"
              bind:value={targetStartCalendar}
            />
            <DatePopoverField
              id="target_end_date"
              label="Target end"
              name="target_end_date"
              bind:value={targetEndCalendar}
            />
          </div>

          <Button type="submit" disabled={pendingAction === "updateProgram"}>
            {pendingAction === "updateProgram" ? "Saving…" : "Save program"}
          </Button>
        </form>
      </CardContent>
    </Card>

    <Card class="border-primary/20 bg-primary/[0.03]">
      <CardHeader>
        <CardTitle class="text-lg">Learning assistant</CardTitle>
        <CardDescription>
          Mock generator: drafts modules, scheduled sessions, weaknesses,
          flashcards, and a sample link. Replace with a real model later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          method="POST"
          action="?/mockAiGenerate"
          class="flex flex-col gap-4"
          use:enhance={dbActionToast(
            "Generating draft plan...",
            "Draft plan generated.",
            {
              actionKey: "mockAiGenerate",
              onStart: () => {
                aiBusy = true;
              },
              onDone: () => {
                aiBusy = false;
              },
            },
          )}
        >
          <div class="flex flex-col gap-1.5">
            <label for="brief" class="text-sm font-medium">Your goal</label>
            <textarea
              id="brief"
              name="brief"
              rows={3}
              maxlength={2000}
              placeholder="e.g. Learn jazz piano from zero in 4 months, 30 min/day"
              class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[5rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
            ></textarea>
          </div>
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="replace_roadmap"
              class="border-input text-primary mt-1 size-4 rounded"
            />
            <span>
              <span class="font-medium">Replace roadmap & weaknesses</span>
              <span class="text-muted-foreground block text-xs leading-relaxed">
                Removes existing modules (and their sessions) and weaknesses
                before adding the draft. Flashcards and resources are always
                appended.
              </span>
            </span>
          </label>
          <Button type="submit" disabled={aiBusy}>
            {aiBusy ? "Generating…" : "Generate draft plan"}
          </Button>
        </form>
      </CardContent>
    </Card>

    <Tabs.Root bind:value={editTab} class="w-full gap-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 class="text-foreground text-lg font-semibold">Program content</h2>
          <p class="text-muted-foreground mt-1 max-w-2xl text-sm">
            Switch between roadmap, weaknesses, flashcards, and resources.
          </p>
        </div>
        <Tabs.List
          class="grid w-full min-w-0 grid-cols-2 gap-1.5 sm:max-w-xl sm:flex-1 sm:grid-cols-4"
        >
          <Tabs.Trigger value="roadmap" class="w-full min-w-0 px-2.5">
            Roadmap
          </Tabs.Trigger>
          <Tabs.Trigger value="weaknesses" class="w-full min-w-0 px-2.5">
            Weaknesses
          </Tabs.Trigger>
          <Tabs.Trigger value="flashcards" class="w-full min-w-0 px-2.5">
            Flashcards
          </Tabs.Trigger>
          <Tabs.Trigger value="resources" class="w-full min-w-0 px-2.5">
            Resources
          </Tabs.Trigger>
        </Tabs.List>
      </div>

      <Tabs.Content value="roadmap" class="mt-2 flex flex-col gap-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 class="text-foreground text-base font-semibold">Roadmap</h3>
            <p class="text-muted-foreground mt-1 max-w-2xl text-sm">
              Drag from the bottom of a parent to the top of a child to connect
              modules. Edits stay local until you save. Use the panel on the
              canvas to add a module or save everything.
            </p>
          </div>
          <form
            bind:this={saveRoadmapFormEl}
            method="POST"
            action="?/saveRoadmapBatch"
            class="flex shrink-0 flex-wrap items-center gap-2"
            use:enhance={dbActionToastEnhance("Saving roadmap...", "Roadmap saved.", {
              onSuccess: async () => {
                roadmapDirty = false;
                await afterProgramMutation();
              },
            })}
            onsubmit={(e) => {
              const err = validateRoadmapTree(draftModules);
              if (err) {
                e.preventDefault();
                void import("svelte-sonner").then(({ toast }) => toast.error(err));
              }
            }}
          >
            <input type="hidden" name="payload" value={roadmapPayloadJson} />
            <Button
              type="submit"
              variant="default"
              class="sm:mt-0.5"
              disabled={!roadmapDirty}
            >
              Save roadmap
            </Button>
          </form>
        </div>

        {#if draftModules.length === 0}
          <p class="text-muted-foreground text-sm">
            No modules yet. Use <strong class="text-foreground">New module</strong> on
            the canvas to create the first one, then save.
          </p>
        {/if}

        <section
          class="border-border/70 bg-background relative w-full overflow-hidden rounded-2xl border"
          aria-label="Roadmap editor canvas"
        >
          <div
            class="bg-background h-[min(28rem,60dvh)] w-full min-h-[20rem] sm:h-[min(34rem,65dvh)] sm:min-h-[24rem]"
          >
            {#if draftModules.length === 0}
              <div
                class="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm"
              >
                Empty canvas — add a module from the panel above.
              </div>
            {:else}
              <SvelteFlow
                bind:nodes
                bind:edges
                {nodeTypes}
                colorMode={flowColorMode}
                nodesDraggable={false}
                onconnect={handleRoadmapConnect}
                ondelete={handleRoadmapDelete}
                isValidConnection={isValidRoadmapConnection}
                fitView
                fitViewOptions={{ padding: 0.2, maxZoom: 1.35, minZoom: 0.2 }}
                minZoom={0.15}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
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
                <Panel position="top-right">
                  <div class="flex flex-col gap-2 rounded-xl border border-border/80 bg-card/95 p-2 shadow-sm">
                    <Button
                      type="button"
                      size="sm"
                      class="w-full"
                      onclick={() => (newModuleDialogOpen = true)}
                    >
                      New module
                    </Button>
                  </div>
                </Panel>
              </SvelteFlow>
            {/if}
          </div>
        </section>

        <Dialog.Root bind:open={newModuleDialogOpen}>
          <Dialog.Content class="sm:max-w-lg">
            <Dialog.Header>
              <Dialog.Title>New module</Dialog.Title>
              <Dialog.Description>
                Attach under the program root or pick a parent module. Changes apply
                to the draft until you save the roadmap.
              </Dialog.Description>
            </Dialog.Header>
            <div class="flex flex-col gap-3">
              {#if draftModules.length > 0}
                <div class="flex flex-col gap-1.5">
                  <label
                    for="new-mod-parent"
                    class="text-foreground text-sm font-medium">Parent</label
                  >
                  <Select.Root
                    type="single"
                    bind:value={newModuleParentId}
                    items={parentModuleSelectItems}
                  >
                    <Select.Trigger id="new-mod-parent" class="w-full min-w-0">
                      {parentModuleTriggerLabel}
                    </Select.Trigger>
                    <Select.Content>
                      {#each parentModuleSelectItems as item (item.value)}
                        <Select.Item value={item.value} label={item.label} />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
              {:else}
                <p class="text-muted-foreground text-xs">
                  This will be the program root module.
                </p>
              {/if}
              <div class="flex flex-col gap-1.5">
                <label
                  for="new-mod-title"
                  class="text-foreground text-sm font-medium">Title</label
                >
                <Input
                  id="new-mod-title"
                  bind:value={newModuleTitle}
                  maxlength={200}
                  placeholder="Module title (e.g. Music theory)"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label
                  for="new-mod-desc"
                  class="text-foreground text-sm font-medium">Description</label
                >
                <textarea
                  id="new-mod-desc"
                  bind:value={newModuleDescription}
                  rows={2}
                  maxlength={4000}
                  placeholder="Optional"
                  class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                ></textarea>
              </div>
              <div class="flex flex-wrap justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onclick={() => (newModuleDialogOpen = false)}
                >
                  Cancel
                </Button>
                <Button type="button" onclick={addModuleFromDialog}>Add module</Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      </Tabs.Content>

      <Tabs.Content value="weaknesses" class="mt-2">
        <Card>
          <CardHeader
            class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div>
              <CardTitle class="text-lg">Weaknesses</CardTitle>
              <CardDescription>
                Things to bias extra sessions toward—tracked for adaptation, not
                scoring.
              </CardDescription>
            </div>
            <Button
              type="button"
              class="shrink-0"
              onclick={openAddWeaknessDialog}
            >
              Add weakness
            </Button>
          </CardHeader>
          <CardContent class="space-y-6">
            {#if data.weaknesses.length === 0}
              <p class="text-muted-foreground text-sm">None yet.</p>
            {:else}
              <ul class="space-y-3">
                {#each data.weaknesses as w (w.id)}
                  <li
                    class="border-border/80 flex flex-col gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div>
                      <p class="text-foreground font-medium">{w.title}</p>
                      {#if w.description}
                        <p class="text-muted-foreground mt-1 text-sm">
                          {w.description}
                        </p>
                      {/if}
                      <p class="text-muted-foreground mt-2 text-xs">
                        Priority {w.priority}
                      </p>
                    </div>
                    <div class="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onclick={() => openEditWeakness(w)}
                      >
                        <PencilIcon class="mr-1 size-3.5" />
                        Edit
                      </Button>
                      <form
                        id={`delete-weakness-form-${w.id}`}
                        method="POST"
                        action="?/deleteWeakness"
                        use:enhance={dbActionToast(
                          "Removing weakness...",
                          "Weakness removed.",
                        )}
                      >
                        <input type="hidden" name="weakness_id" value={w.id} />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onclick={() => (pendingWeaknessDeleteId = w.id)}
                        >
                          Remove
                        </Button>
                      </form>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </CardContent>
        </Card>

        <Dialog.Root
          bind:open={addWeaknessOpen}
          onOpenChange={(o) => {
            if (!o) addWeaknessOpen = false;
          }}
        >
          <Dialog.Content class="sm:max-w-lg">
            <Dialog.Header>
              <Dialog.Title>Add weakness</Dialog.Title>
              <Dialog.Description>
                Track something to bias extra sessions toward.
              </Dialog.Description>
            </Dialog.Header>
            <form
              method="POST"
              action="?/addWeakness"
              class="flex flex-col gap-3"
              use:enhance={dbActionToast("Adding weakness...", "Weakness added.", {
                onSuccessExtra: () => {
                  addWeaknessOpen = false;
                },
              })}
            >
              <div class="flex flex-col gap-1.5">
                <label
                  for="add-w-title"
                  class="text-foreground text-sm font-medium">Title</label
                >
                <Input
                  id="add-w-title"
                  name="title"
                  required
                  maxlength={200}
                  placeholder="Title"
                  bind:value={addWeaknessTitle}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label
                  for="add-w-desc"
                  class="text-foreground text-sm font-medium">Description</label
                >
                <textarea
                  id="add-w-desc"
                  name="description"
                  rows={2}
                  maxlength={4000}
                  placeholder="Description"
                  bind:value={addWeaknessDescription}
                  class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                ></textarea>
              </div>
              <div class="flex flex-col gap-1.5">
                <label
                  for="add-w-priority"
                  class="text-foreground text-sm font-medium">Priority</label
                >
                <Input
                  id="add-w-priority"
                  name="priority"
                  type="number"
                  min={0}
                  max={100}
                  bind:value={addWeaknessPriority}
                  placeholder="0–100"
                />
              </div>
              <div class="flex flex-wrap justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onclick={() => (addWeaknessOpen = false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Add weakness</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root
          open={editWeaknessId !== null}
          onOpenChange={(o) => {
            if (!o) editWeaknessId = null;
          }}
        >
          <Dialog.Content class="sm:max-w-lg">
            <Dialog.Header>
              <Dialog.Title>Edit weakness</Dialog.Title>
              <Dialog.Description>
                Update title, description, or priority.
              </Dialog.Description>
            </Dialog.Header>
            {#if editWeaknessId}
              <form
                method="POST"
                action="?/updateWeakness"
                class="flex flex-col gap-3"
                use:enhance={dbActionToast(
                  "Saving weakness...",
                  "Weakness updated.",
                  {
                    onSuccessExtra: () => {
                      editWeaknessId = null;
                    },
                  },
                )}
              >
                <input type="hidden" name="weakness_id" value={editWeaknessId} />
                <div class="flex flex-col gap-1.5">
                  <label
                    for="edit-w-title"
                    class="text-foreground text-sm font-medium">Title</label
                  >
                  <Input
                    id="edit-w-title"
                    name="title"
                    required
                    maxlength={200}
                    placeholder="Title"
                    bind:value={editWeaknessTitle}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label
                    for="edit-w-desc"
                    class="text-foreground text-sm font-medium">Description</label
                  >
                  <textarea
                    id="edit-w-desc"
                    name="description"
                    rows={2}
                    maxlength={4000}
                    placeholder="Description"
                    bind:value={editWeaknessDescription}
                    class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                  ></textarea>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label
                    for="edit-w-priority"
                    class="text-foreground text-sm font-medium">Priority</label
                  >
                  <Input
                    id="edit-w-priority"
                    name="priority"
                    type="number"
                    min={0}
                    max={100}
                    bind:value={editWeaknessPriority}
                    placeholder="0–100"
                  />
                </div>
                <div class="flex flex-wrap justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onclick={() => (editWeaknessId = null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Save</Button>
                </div>
              </form>
            {/if}
          </Dialog.Content>
        </Dialog.Root>
      </Tabs.Content>

      <Tabs.Content value="flashcards" class="mt-2">
        <Card>
          <CardHeader
            class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div>
              <CardTitle class="text-lg">Flashcards</CardTitle>
              <CardDescription
                >Pool for flashcard sessions (shuffle in the app).</CardDescription
              >
            </div>
            <Button
              type="button"
              class="shrink-0"
              onclick={openAddFlashcardDialog}
            >
              Add flashcard
            </Button>
          </CardHeader>
          <CardContent class="space-y-6">
            {#if data.flashcards.length === 0}
              <p class="text-muted-foreground text-sm">No cards yet.</p>
            {:else}
              <ul class="space-y-3">
                {#each data.flashcards as c (c.id)}
                  <li
                    class="border-border/80 flex flex-col gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div class="min-w-0 text-sm">
                      <p class="text-foreground font-medium">{c.front_text}</p>
                      <p class="text-muted-foreground mt-1">{c.back_text}</p>
                    </div>
                    <div class="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onclick={() => openEditFlashcard(c)}
                      >
                        <PencilIcon class="mr-1 size-3.5" />
                        Edit
                      </Button>
                      <form
                        id={`delete-flashcard-form-${c.id}`}
                        method="POST"
                        action="?/deleteFlashcard"
                        use:enhance={dbActionToast(
                          "Removing flashcard...",
                          "Flashcard removed.",
                        )}
                      >
                        <input type="hidden" name="flashcard_id" value={c.id} />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onclick={() => (pendingFlashcardDeleteId = c.id)}
                        >
                          Remove
                        </Button>
                      </form>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </CardContent>
        </Card>

        <Dialog.Root
          bind:open={addFlashcardOpen}
          onOpenChange={(o) => {
            if (!o) addFlashcardOpen = false;
          }}
        >
          <Dialog.Content class="sm:max-w-lg">
            <Dialog.Header>
              <Dialog.Title>Add flashcard</Dialog.Title>
              <Dialog.Description>
                Front and back text for the program pool.
              </Dialog.Description>
            </Dialog.Header>
            <form
              method="POST"
              action="?/addFlashcard"
              class="flex flex-col gap-3"
              use:enhance={dbActionToast(
                "Adding flashcard...",
                "Flashcard added.",
                {
                  onSuccessExtra: () => {
                    addFlashcardOpen = false;
                  },
                },
              )}
            >
              <div class="flex flex-col gap-1.5">
                <label
                  for="add-fc-front"
                  class="text-foreground text-sm font-medium">Front</label
                >
                <textarea
                  id="add-fc-front"
                  name="front_text"
                  required
                  rows={2}
                  maxlength={4000}
                  placeholder="Front"
                  bind:value={addFlashcardFront}
                  class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                ></textarea>
              </div>
              <div class="flex flex-col gap-1.5">
                <label
                  for="add-fc-back"
                  class="text-foreground text-sm font-medium">Back</label
                >
                <textarea
                  id="add-fc-back"
                  name="back_text"
                  required
                  rows={2}
                  maxlength={4000}
                  placeholder="Back"
                  bind:value={addFlashcardBack}
                  class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                ></textarea>
              </div>
              <div class="flex flex-wrap justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onclick={() => (addFlashcardOpen = false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Add flashcard</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root
          open={editFlashcardId !== null}
          onOpenChange={(o) => {
            if (!o) editFlashcardId = null;
          }}
        >
          <Dialog.Content class="sm:max-w-lg">
            <Dialog.Header>
              <Dialog.Title>Edit flashcard</Dialog.Title>
              <Dialog.Description>
                Update the front and back of this card.
              </Dialog.Description>
            </Dialog.Header>
            {#if editFlashcardId}
              <form
                method="POST"
                action="?/updateFlashcard"
                class="flex flex-col gap-3"
                use:enhance={dbActionToast(
                  "Saving flashcard...",
                  "Flashcard updated.",
                  {
                    onSuccessExtra: () => {
                      editFlashcardId = null;
                    },
                  },
                )}
              >
                <input type="hidden" name="flashcard_id" value={editFlashcardId} />
                <div class="flex flex-col gap-1.5">
                  <label
                    for="edit-fc-front"
                    class="text-foreground text-sm font-medium">Front</label
                  >
                  <textarea
                    id="edit-fc-front"
                    name="front_text"
                    required
                    rows={2}
                    maxlength={4000}
                    placeholder="Front"
                    bind:value={editFlashcardFront}
                    class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                  ></textarea>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label
                    for="edit-fc-back"
                    class="text-foreground text-sm font-medium">Back</label
                  >
                  <textarea
                    id="edit-fc-back"
                    name="back_text"
                    required
                    rows={2}
                    maxlength={4000}
                    placeholder="Back"
                    bind:value={editFlashcardBack}
                    class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                  ></textarea>
                </div>
                <div class="flex flex-wrap justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onclick={() => (editFlashcardId = null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Save</Button>
                </div>
              </form>
            {/if}
          </Dialog.Content>
        </Dialog.Root>
      </Tabs.Content>

      <Tabs.Content value="resources" class="mt-2">
        <Card>
          <CardHeader
            class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div>
              <CardTitle class="text-lg">Metalearning resources</CardTitle>
              <CardDescription
                >Documents, links, or pictures for this program.</CardDescription
              >
            </div>
            <Button
              type="button"
              class="shrink-0"
              onclick={openAddResourceDialog}
            >
              Add resource
            </Button>
          </CardHeader>
          <CardContent class="space-y-6">
            {#if data.resources.length === 0}
              <p class="text-muted-foreground text-sm">None yet.</p>
            {:else}
              <ul class="space-y-3">
                {#each data.resources as r (r.id)}
                  <li
                    class="border-border/80 flex flex-col gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div class="min-w-0 text-sm">
                      <p class="text-foreground font-medium">{r.title}</p>
                      <p class="text-muted-foreground mt-1 break-all">{r.uri}</p>
                      <Badge variant="outline" class="mt-2 capitalize"
                        >{r.kind}</Badge
                      >
                    </div>
                    <div class="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onclick={() => openEditResource(r)}
                      >
                        <PencilIcon class="mr-1 size-3.5" />
                        Edit
                      </Button>
                      <form
                        id={`delete-resource-form-${r.id}`}
                        method="POST"
                        action="?/deleteResource"
                        use:enhance={dbActionToast(
                          "Removing resource...",
                          "Resource removed.",
                        )}
                      >
                        <input type="hidden" name="resource_id" value={r.id} />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onclick={() => (pendingResourceDeleteId = r.id)}
                        >
                          Remove
                        </Button>
                      </form>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </CardContent>
        </Card>

        <Dialog.Root
          bind:open={addResourceOpen}
          onOpenChange={(o) => {
            if (!o) addResourceOpen = false;
          }}
        >
          <Dialog.Content class="sm:max-w-lg">
            <Dialog.Header>
              <Dialog.Title>Add resource</Dialog.Title>
              <Dialog.Description>
                Link, document, or picture for metalearning.
              </Dialog.Description>
            </Dialog.Header>
            <form
              method="POST"
              action="?/addResource"
              class="flex flex-col gap-3"
              use:enhance={dbActionToast("Adding resource...", "Resource added.", {
                onSuccessExtra: () => {
                  addResourceOpen = false;
                },
              })}
            >
              <div class="flex flex-col gap-1.5">
                <label
                  for="add-res-kind"
                  class="text-foreground text-sm font-medium">Type</label
                >
                <Select.Root
                  type="single"
                  name="kind"
                  bind:value={addResourceKind}
                  required
                  items={[...RESOURCE_KIND_ITEMS]}
                >
                  <Select.Trigger id="add-res-kind" class="w-full min-w-0">
                    {addResourceKindLabel}
                  </Select.Trigger>
                  <Select.Content>
                    {#each RESOURCE_KIND_ITEMS as rk (rk.value)}
                      <Select.Item value={rk.value} label={rk.label} />
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="flex flex-col gap-1.5">
                <label
                  for="add-res-title"
                  class="text-foreground text-sm font-medium">Title</label
                >
                <Input
                  id="add-res-title"
                  name="title"
                  required
                  maxlength={200}
                  placeholder="Title"
                  bind:value={addResourceTitle}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label
                  for="add-res-uri"
                  class="text-foreground text-sm font-medium">URL or path</label
                >
                <Input
                  id="add-res-uri"
                  name="uri"
                  required
                  maxlength={2000}
                  placeholder="URL or storage path"
                  bind:value={addResourceUri}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label
                  for="add-res-desc"
                  class="text-foreground text-sm font-medium">Description</label
                >
                <textarea
                  id="add-res-desc"
                  name="description"
                  rows={2}
                  maxlength={4000}
                  placeholder="Optional"
                  bind:value={addResourceDescription}
                  class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                ></textarea>
              </div>
              <div class="flex flex-wrap justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onclick={() => (addResourceOpen = false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Add resource</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root
          open={editResourceId !== null}
          onOpenChange={(o) => {
            if (!o) editResourceId = null;
          }}
        >
          <Dialog.Content class="sm:max-w-lg">
            <Dialog.Header>
              <Dialog.Title>Edit resource</Dialog.Title>
              <Dialog.Description>
                Update type, title, link, or description.
              </Dialog.Description>
            </Dialog.Header>
            {#if editResourceId}
              <form
                method="POST"
                action="?/updateResource"
                class="flex flex-col gap-3"
                use:enhance={dbActionToast(
                  "Saving resource...",
                  "Resource updated.",
                  {
                    onSuccessExtra: () => {
                      editResourceId = null;
                    },
                  },
                )}
              >
                <input type="hidden" name="resource_id" value={editResourceId} />
                <div class="flex flex-col gap-1.5">
                  <label
                    for="edit-res-kind"
                    class="text-foreground text-sm font-medium">Type</label
                  >
                  <Select.Root
                    type="single"
                    name="kind"
                    bind:value={editResourceKind}
                    required
                    items={[...RESOURCE_KIND_ITEMS]}
                  >
                    <Select.Trigger id="edit-res-kind" class="w-full min-w-0">
                      {editResourceKindLabel}
                    </Select.Trigger>
                    <Select.Content>
                      {#each RESOURCE_KIND_ITEMS as rk (rk.value)}
                        <Select.Item value={rk.value} label={rk.label} />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label
                    for="edit-res-title"
                    class="text-foreground text-sm font-medium">Title</label
                  >
                  <Input
                    id="edit-res-title"
                    name="title"
                    required
                    maxlength={200}
                    placeholder="Title"
                    bind:value={editResourceTitle}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label
                    for="edit-res-uri"
                    class="text-foreground text-sm font-medium">URL or path</label
                  >
                  <Input
                    id="edit-res-uri"
                    name="uri"
                    required
                    maxlength={2000}
                    placeholder="URL or storage path"
                    bind:value={editResourceUri}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label
                    for="edit-res-desc"
                    class="text-foreground text-sm font-medium">Description</label
                  >
                  <textarea
                    id="edit-res-desc"
                    name="description"
                    rows={2}
                    maxlength={4000}
                    placeholder="Optional"
                    bind:value={editResourceDescription}
                    class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                  ></textarea>
                </div>
                <div class="flex flex-wrap justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onclick={() => (editResourceId = null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Save</Button>
                </div>
              </form>
            {/if}
          </Dialog.Content>
        </Dialog.Root>
      </Tabs.Content>
    </Tabs.Root>

    <DestructiveConfirmDialog
      open={deleteProgramDialogOpen}
      onOpenChange={(v) => (deleteProgramDialogOpen = v)}
      title="Delete program?"
      description="Delete this program and all of its modules, sessions, cards, and resources? This cannot be undone."
      confirmLabel="Delete program"
      onConfirm={() => deleteProgramFormEl?.requestSubmit()}
    />

    <DestructiveConfirmDialog
      open={pendingWeaknessDeleteId !== null}
      onOpenChange={(v) => {
        if (!v) pendingWeaknessDeleteId = null;
      }}
      title="Remove weakness?"
      description="Remove this weakness from the program? This cannot be undone."
      confirmLabel="Remove"
      onConfirm={() => {
        const id = pendingWeaknessDeleteId;
        if (id) requestSubmitFormById(`delete-weakness-form-${id}`);
      }}
    />

    <DestructiveConfirmDialog
      open={pendingFlashcardDeleteId !== null}
      onOpenChange={(v) => {
        if (!v) pendingFlashcardDeleteId = null;
      }}
      title="Remove flashcard?"
      description="Remove this card from the program pool? This cannot be undone."
      confirmLabel="Remove"
      onConfirm={() => {
        const id = pendingFlashcardDeleteId;
        if (id) requestSubmitFormById(`delete-flashcard-form-${id}`);
      }}
    />

    <DestructiveConfirmDialog
      open={pendingResourceDeleteId !== null}
      onOpenChange={(v) => {
        if (!v) pendingResourceDeleteId = null;
      }}
      title="Remove resource?"
      description="Remove this metalearning resource? This cannot be undone."
      confirmLabel="Remove"
      onConfirm={() => {
        const id = pendingResourceDeleteId;
        if (id) requestSubmitFormById(`delete-resource-form-${id}`);
      }}
    />
  {/if}
</main>
