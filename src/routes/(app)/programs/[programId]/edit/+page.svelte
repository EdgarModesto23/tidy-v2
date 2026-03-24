<script lang="ts">
  import { resolve } from "$app/paths";
  import { enhance } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import {
    clearProgramBundleCache,
    clearProgramListCache,
  } from "$lib/cache/learningDataCache";
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
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import type { PageProps } from "./$types";
  import type { LearningSessionType } from "$lib/learning/types";
  import { modulesInTreeOrder } from "$lib/learning/moduleFlowLayout";

  let { data, form, params }: PageProps = $props();

  const fieldClass =
    "border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full min-w-0 rounded-2xl border px-3 py-1 text-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none";

  let programReason = $state<"instrumental" | "intrinsic">("intrinsic");
  let aiBusy = $state(false);
  let pendingAction = $state<string | null>(null);

  let deleteProgramDialogOpen = $state(false);
  let deleteProgramFormEl: HTMLFormElement | undefined = $state();

  let pendingModuleDelete = $state<{ id: string; isRoot: boolean } | null>(null);
  let pendingSessionDeleteId = $state<string | null>(null);
  let pendingWeaknessDeleteId = $state<string | null>(null);
  let pendingFlashcardDeleteId = $state<string | null>(null);
  let pendingResourceDeleteId = $state<string | null>(null);

  const moduleDeleteDialogDescription = $derived(
    pendingModuleDelete?.isRoot
      ? "Delete the root module? This removes every sub-module and their sessions."
      : "Remove this module and its sessions?",
  );

  $effect(() => {
    const pr = data.program;
    if (pr) programReason = pr.reason;
  });

  const sessionTypeLabel: Record<LearningSessionType, string> = {
    test: "Test",
    study: "Study",
    drill: "Drill",
    project: "Project",
    flashcard_session: "Flashcards",
  };

  async function afterProgramMutation() {
    if (data.userId == null) return;
    clearProgramListCache(data.userId);
    clearProgramBundleCache(data.userId, params.programId);
    await invalidate("app:learning:list");
    await invalidate(`app:learning:program:${params.programId}`);
  }

  function dbActionToast(
    pendingMessage: string,
    successMessage: string,
    options?: {
      actionKey?: string;
      onStart?: () => void;
      onDone?: () => void;
    },
  ) {
    const { actionKey, onStart, onDone } = options ?? {};
    return dbActionToastEnhance(pendingMessage, successMessage, {
      onStart: () => {
        if (actionKey) pendingAction = actionKey;
        onStart?.();
      },
      onDone: () => {
        if (actionKey) pendingAction = null;
        onDone?.();
      },
      onSuccess: afterProgramMutation,
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

    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1
          class="text-foreground text-3xl font-semibold tracking-tight md:text-4xl"
        >
          {data.program.name}
        </h1>
        {#if data.program.description}
          <p class="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
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

          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Reason to learn</span>
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
          </div>

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
            <div class="flex flex-col gap-1.5">
              <label for="target_start_date" class="text-sm font-medium"
                >Target start</label
              >
              <Input
                id="target_start_date"
                name="target_start_date"
                type="date"
                value={data.program.target_start_date ?? ""}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="target_end_date" class="text-sm font-medium"
                >Target end</label
              >
              <Input
                id="target_end_date"
                name="target_end_date"
                type="date"
                value={data.program.target_end_date ?? ""}
              />
            </div>
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

    <section class="flex flex-col gap-4">
      <div>
        <h2 class="text-foreground text-lg font-semibold">Roadmap</h2>
        <p class="text-muted-foreground mt-1 max-w-2xl text-sm">
          Each program has one <strong class="text-foreground">root</strong> module; other
          modules attach under a parent so the roadmap view can show a tree. Mark sessions
          done when finished.
        </p>
      </div>

      {#if data.modules.length === 0}
        <p class="text-muted-foreground text-sm">No modules yet. Add one below.</p>
      {/if}

      {#each modulesInTreeOrder(data.modules) as mod (mod.id)}
        {@const sessions = data.sessionsByModule[mod.id] ?? []}
        <Card>
          <CardHeader class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <CardTitle class="text-base">{mod.title}</CardTitle>
                {#if !mod.parent_module_id}
                  <Badge variant="secondary" class="text-[10px] tracking-wide uppercase"
                    >Root</Badge
                  >
                {/if}
                {#if mod.completed_at}
                  <Badge variant="outline" class="text-xs">Module done</Badge>
                {/if}
              </div>
              {#if mod.description}
                <CardDescription class="mt-1">{mod.description}</CardDescription>
              {/if}
            </div>
            <form
              id={`delete-module-form-${mod.id}`}
              method="POST"
              action="?/deleteModule"
              use:enhance={dbActionToast(
                "Removing module...",
                "Module removed.",
              )}
            >
              <input type="hidden" name="module_id" value={mod.id} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() =>
                  (pendingModuleDelete = {
                    id: mod.id,
                    isRoot: !mod.parent_module_id,
                  })}
              >
                Remove module
              </Button>
            </form>
          </CardHeader>
          <Separator />
          <CardContent class="space-y-6 pt-6">
            {#if sessions.length === 0}
              <p class="text-muted-foreground text-sm">No sessions yet.</p>
            {:else}
              <ul class="space-y-3">
                {#each sessions as s (s.id)}
                  {@const sessionDone = s.status === "completed"}
                  <li
                    class="border-border/80 flex flex-col gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    class:opacity-75={sessionDone}
                  >
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span
                          class="text-foreground font-medium"
                          class:line-through={sessionDone}>{s.name}</span
                        >
                        <Badge variant="secondary" class="text-xs capitalize">
                          {sessionTypeLabel[s.session_type]}
                        </Badge>
                        <Badge variant="outline" class="text-xs">
                          {s.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p class="text-muted-foreground mt-1 tabular-nums text-xs">
                        {s.planned_start_date} → {s.planned_end_date}
                        {#if s.estimated_duration_minutes}
                          · ~{s.estimated_duration_minutes} min
                        {/if}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <form
                        method="POST"
                        action="?/toggleSessionComplete"
                        use:enhance={dbActionToast(
                          "Updating session…",
                          sessionDone ? "Session reopened." : "Session marked done.",
                        )}
                      >
                        <input type="hidden" name="session_id" value={s.id} />
                        <Button type="submit" variant="secondary" size="sm">
                          {sessionDone ? "Reopen" : "Done"}
                        </Button>
                      </form>
                      <form
                        id={`delete-session-form-${s.id}`}
                        method="POST"
                        action="?/deleteSession"
                        use:enhance={dbActionToast(
                          "Removing session...",
                          "Session removed.",
                        )}
                      >
                        <input type="hidden" name="session_id" value={s.id} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onclick={() => (pendingSessionDeleteId = s.id)}
                        >
                          Remove
                        </Button>
                      </form>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}

            <div class="bg-muted/40 rounded-xl p-4">
              <p class="text-foreground mb-3 text-sm font-medium">Add session</p>
              <form
                method="POST"
                action="?/addSession"
                class="flex flex-col gap-3"
                use:enhance={dbActionToast(
                  "Adding session...",
                  "Session scheduled.",
                )}
              >
                <input type="hidden" name="module_id" value={mod.id} />
                <Input
                  name="name"
                  required
                  maxlength={200}
                  placeholder="Session name"
                />
                <select name="session_type" class={fieldClass} required>
                  <option value="study">Study</option>
                  <option value="drill">Drill</option>
                  <option value="project">Project</option>
                  <option value="test">Test</option>
                  <option value="flashcard_session">Flashcard session</option>
                </select>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div class="flex flex-col gap-1">
                    <label class="text-muted-foreground text-xs" for="ps-{mod.id}"
                      >Planned start</label
                    >
                    <Input
                      id="ps-{mod.id}"
                      name="planned_start_date"
                      type="date"
                      required
                      value={data.todayIso}
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-muted-foreground text-xs" for="pe-{mod.id}"
                      >Planned end</label
                    >
                    <Input
                      id="pe-{mod.id}"
                      name="planned_end_date"
                      type="date"
                      required
                      value={data.todayIso}
                    />
                  </div>
                </div>
                <Input
                  name="estimated_duration_minutes"
                  type="number"
                  min={1}
                  placeholder="Est. minutes (optional)"
                />
                <Button type="submit" variant="secondary" size="sm"
                  >Add session</Button
                >
              </form>
            </div>
          </CardContent>
        </Card>
      {/each}

      <Card>
        <CardHeader>
          <CardTitle class="text-base">New module</CardTitle>
          <CardDescription
            >Attach under the program root or pick a parent module.</CardDescription
          >
        </CardHeader>
        <CardContent>
          <form
            method="POST"
            action="?/addModule"
            class="flex flex-col gap-3"
            use:enhance={dbActionToast("Adding module...", "Module added.")}
          >
            {#if data.modules.length > 0}
              <div class="flex flex-col gap-1.5">
                <label for="new-mod-parent" class="text-foreground text-sm font-medium"
                  >Parent</label
                >
                <select
                  id="new-mod-parent"
                  name="parent_module_id"
                  class={fieldClass}
                >
                  <option value="">Under program root (default)</option>
                  {#each modulesInTreeOrder(data.modules) as m}
                    <option value={m.id}>
                      {m.title}{!m.parent_module_id ? " — root" : ""}
                    </option>
                  {/each}
                </select>
              </div>
            {:else}
              <p class="text-muted-foreground text-xs">
                This will be the program root module.
              </p>
            {/if}
            <Input
              name="title"
              required
              maxlength={200}
              placeholder="Module title (e.g. Music theory)"
            />
            <textarea
              name="description"
              rows={2}
              maxlength={4000}
              placeholder="Optional description"
              class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
            ></textarea>
            <Button type="submit" class="w-fit">Add module</Button>
          </form>
        </CardContent>
      </Card>
    </section>

    <Card>
      <CardHeader>
        <CardTitle class="text-lg">Weaknesses</CardTitle>
        <CardDescription>
          Things to bias extra sessions toward—tracked for adaptation, not
          scoring.
        </CardDescription>
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
                    <p class="text-muted-foreground mt-1 text-sm">{w.description}</p>
                  {/if}
                  <p class="text-muted-foreground mt-2 text-xs">
                    Priority {w.priority}
                  </p>
                </div>
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
                    variant="ghost"
                    size="sm"
                    onclick={() => (pendingWeaknessDeleteId = w.id)}
                  >
                    Remove
                  </Button>
                </form>
              </li>
            {/each}
          </ul>
        {/if}

        <form
          method="POST"
          action="?/addWeakness"
          class="flex flex-col gap-3 border-t pt-6"
          use:enhance={dbActionToast(
            "Adding weakness...",
            "Weakness added.",
          )}
        >
          <Input name="title" required maxlength={200} placeholder="Title" />
          <textarea
            name="description"
            rows={2}
            maxlength={4000}
            placeholder="Description"
            class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
          ></textarea>
          <Input
            name="priority"
            type="number"
            min={0}
            max={100}
            value="0"
            placeholder="Priority (0–100)"
          />
          <Button type="submit" class="w-fit">Add weakness</Button>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-lg">Flashcards</CardTitle>
        <CardDescription>Pool for flashcard sessions (shuffle in the app).</CardDescription>
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
                    variant="ghost"
                    size="sm"
                    onclick={() => (pendingFlashcardDeleteId = c.id)}
                  >
                    Remove
                  </Button>
                </form>
              </li>
            {/each}
          </ul>
        {/if}

        <form
          method="POST"
          action="?/addFlashcard"
          class="flex flex-col gap-3 border-t pt-6"
          use:enhance={dbActionToast(
            "Adding flashcard...",
            "Flashcard added.",
          )}
        >
          <textarea
            name="front_text"
            required
            rows={2}
            maxlength={4000}
            placeholder="Front"
            class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
          ></textarea>
          <textarea
            name="back_text"
            required
            rows={2}
            maxlength={4000}
            placeholder="Back"
            class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
          ></textarea>
          <Button type="submit" class="w-fit">Add flashcard</Button>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-lg">Metalearning resources</CardTitle>
        <CardDescription>Documents, links, or pictures for this program.</CardDescription>
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
                  <Badge variant="outline" class="mt-2 capitalize">{r.kind}</Badge>
                </div>
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
                    variant="ghost"
                    size="sm"
                    onclick={() => (pendingResourceDeleteId = r.id)}
                  >
                    Remove
                  </Button>
                </form>
              </li>
            {/each}
          </ul>
        {/if}

        <form
          method="POST"
          action="?/addResource"
          class="flex flex-col gap-3 border-t pt-6"
          use:enhance={dbActionToast(
            "Adding resource...",
            "Resource added.",
          )}
        >
          <select name="kind" class={fieldClass} required>
            <option value="link">Link</option>
            <option value="document">Document</option>
            <option value="picture">Picture</option>
          </select>
          <Input name="title" required maxlength={200} placeholder="Title" />
          <Input name="uri" required maxlength={2000} placeholder="URL or storage path" />
          <textarea
            name="description"
            rows={2}
            maxlength={4000}
            placeholder="Optional description"
            class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
          ></textarea>
          <Button type="submit" class="w-fit">Add resource</Button>
        </form>
      </CardContent>
    </Card>

    <DestructiveConfirmDialog
      open={deleteProgramDialogOpen}
      onOpenChange={(v) => (deleteProgramDialogOpen = v)}
      title="Delete program?"
      description="Delete this program and all of its modules, sessions, cards, and resources? This cannot be undone."
      confirmLabel="Delete program"
      onConfirm={() => deleteProgramFormEl?.requestSubmit()}
    />

    <DestructiveConfirmDialog
      open={pendingModuleDelete !== null}
      onOpenChange={(v) => {
        if (!v) pendingModuleDelete = null;
      }}
      title="Remove module?"
      description={moduleDeleteDialogDescription}
      confirmLabel="Remove"
      onConfirm={() => {
        const t = pendingModuleDelete;
        if (t) requestSubmitFormById(`delete-module-form-${t.id}`);
      }}
    />

    <DestructiveConfirmDialog
      open={pendingSessionDeleteId !== null}
      onOpenChange={(v) => {
        if (!v) pendingSessionDeleteId = null;
      }}
      title="Remove session?"
      description="Remove this session from the module? This cannot be undone."
      confirmLabel="Remove"
      onConfirm={() => {
        const id = pendingSessionDeleteId;
        if (id) requestSubmitFormById(`delete-session-form-${id}`);
      }}
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
