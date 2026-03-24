<script lang="ts">
  import { browser } from "$app/environment";
  import { resolve } from "$app/paths";
  import { enhance } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import { clearProgramListCache } from "$lib/cache/learningDataCache";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import CalendarDatePicker from "$lib/components/ui/calendar-date-picker.svelte";
  import { Input } from "$lib/components/ui/input";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  let reason = $state<"instrumental" | "intrinsic">("intrinsic");
  let creating = $state(false);
  let toastApi = $state<any>(null);

  async function getToast() {
    if (!browser) return null;
    if (toastApi) return toastApi;
    const mod = await import("svelte-sonner");
    toastApi = mod.toast;
    return toastApi;
  }

  function dbActionToast(
    pendingMessage: string,
    successMessage: string,
    onStart?: () => void,
    onDone?: () => void,
  ) {
    return () => {
      onStart?.();
      const id = crypto.randomUUID();
      const toastReady = getToast();
      void toastReady.then((toast) => {
        toast?.loading(pendingMessage, {
          id,
          position: "top-center",
          icon: Spinner,
        });
      });
      return async ({ result, update }: any) => {
        const toast = await toastReady;
        if (result.type === "failure") {
          const message =
            (result.data as { message?: string } | null)?.message ??
            "Database action failed.";
          toast?.error(message, { id, position: "top-center", icon: null });
        } else if (result.type === "error") {
          toast?.error("Unexpected server error.", {
            id,
            position: "top-center",
            icon: null,
          });
        } else if (result.type === "redirect") {
          toast?.success(successMessage, { id, position: "top-center", icon: null });
        } else {
          const message =
            (result.data as { message?: string } | null)?.message ??
            successMessage;
          toast?.success(message, { id, position: "top-center", icon: null });
        }
        const ok =
          result.type === "success" || result.type === "redirect";
        if (ok && data.userId != null) {
          clearProgramListCache(data.userId);
          await invalidate("app:learning:list");
        }
        onDone?.();
        await update();
      };
    };
  }
</script>

<main class="flex flex-col gap-8">
  <header>
    <p
      class="text-primary mb-1 text-xs font-semibold tracking-widest uppercase"
    >
      Learning
    </p>
    <h1
      class="text-foreground text-3xl font-semibold tracking-tight md:text-4xl"
    >
      Programs
    </h1>
    <p class="text-muted-foreground mt-2 max-w-[42ch] text-sm leading-relaxed">
      Create an ultralearning program, then shape modules, sessions, and
      resources—or use the assistant to draft a starting roadmap (mock for
      now).
    </p>
  </header>

  {#if data.loadError}
    <p
      class="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm"
      role="alert"
    >
      {data.loadError}
    </p>
  {/if}

  {#if form?.message}
    <p
      class="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm"
      role="alert"
    >
      {form.message}
    </p>
  {/if}

  <div class="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-start">
    <section class="flex flex-col gap-3">
      <h2 class="text-foreground text-sm font-semibold">Your programs</h2>
      {#if data.programs.length === 0}
        <p class="text-muted-foreground text-sm">
          No programs yet. Create one with the form →
        </p>
      {:else}
        <ul class="flex flex-col gap-3">
          {#each data.programs as p (p.id)}
            <li
              class="border-border/80 bg-card rounded-2xl border transition-colors hover:border-primary/30"
              class:opacity-80={!!p.completed_at}
            >
              <div
                class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <a
                  href={resolve(`/programs/${p.id}`)}
                  class="focus-visible:ring-ring group min-w-0 flex-1 rounded-xl focus-visible:ring-[3px] focus-visible:outline-none"
                >
                  <span
                    class="text-foreground font-medium transition-colors group-hover:text-primary"
                    class:line-through={!!p.completed_at}>{p.name}</span
                  >
                  {#if p.description}
                    <span
                      class="text-muted-foreground mt-1 line-clamp-2 block text-sm leading-relaxed"
                      >{p.description}</span
                    >
                  {/if}
                  <span
                    class="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs"
                  >
                    <span class="capitalize">{p.reason}</span>
                    {#if p.target_start_date}
                      <span class="tabular-nums"
                        >Starts {p.target_start_date}</span
                      >
                    {/if}
                    {#if p.completed_at}
                      <span class="text-primary font-medium">Done</span>
                    {/if}
                  </span>
                </a>

                <div
                  class="flex flex-wrap items-center gap-2 border-border/60 border-t pt-3 sm:w-auto sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8"
                    href={resolve(`/programs/${p.id}/edit`)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8"
                    href={resolve(`/programs/${p.id}`)}
                  >
                    Roadmap
                  </Button>
                  <form
                    method="POST"
                    action="?/toggleProgramComplete"
                    class="inline"
                    use:enhance={dbActionToast(
                      "Updating…",
                      p.completed_at ? "Marked active." : "Marked done.",
                    )}
                  >
                    <input type="hidden" name="program_id" value={p.id} />
                    <Button variant="secondary" size="sm" class="h-8" type="submit">
                      {p.completed_at ? "Reopen" : "Done"}
                    </Button>
                  </form>
                  <form
                    method="POST"
                    action="?/deleteProgram"
                    class="inline"
                    use:enhance={dbActionToast("Deleting…", "Program deleted.")}
                    onsubmit={(e) => {
                      if (
                        !confirm(
                          "Delete this program and all modules, sessions, and related data?",
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="program_id" value={p.id} />
                    <Button
                      variant="ghost"
                      size="sm"
                      type="submit"
                      class="text-destructive hover:text-destructive h-8"
                    >
                      Delete
                    </Button>
                  </form>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <Card class="lg:sticky lg:top-6">
      <CardHeader class="pb-4">
        <CardTitle class="text-lg">New program</CardTitle>
        <CardDescription
          >Basics only—you’ll configure the roadmap next.</CardDescription
        >
      </CardHeader>
      <CardContent class="pt-0">
        <form
          method="POST"
          action="?/create"
          class="flex flex-col gap-4"
          use:enhance={dbActionToast(
            "Creating program...",
            "Program created.",
            () => {
              creating = true;
            },
            () => {
              creating = false;
            },
          )}
        >
          <div class="flex flex-col gap-1.5">
            <label for="name" class="text-foreground text-sm font-medium"
              >Name</label
            >
            <Input
              id="name"
              name="name"
              required
              maxlength={200}
              placeholder="e.g. Piano from zero"
              autocomplete="off"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="text-foreground text-sm font-medium"
              >Reason to learn</span
            >
            <ToggleGroup.Root
              type="single"
              bind:value={reason}
              variant="outline"
              spacing={0}
              class="w-full justify-stretch"
            >
              <ToggleGroup.Item
                value="intrinsic"
                class="flex-1"
                aria-label="Intrinsic motivation">Intrinsic</ToggleGroup.Item
              >
              <ToggleGroup.Item
                value="instrumental"
                class="flex-1"
                aria-label="Instrumental motivation"
                >Instrumental</ToggleGroup.Item
              >
            </ToggleGroup.Root>
            <input type="hidden" name="reason" value={reason} />
            <p class="text-muted-foreground text-xs leading-relaxed">
              Intrinsic: joy, curiosity. Instrumental: career, grades, external
              outcomes.
            </p>
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
              placeholder="What pulled you toward this?"
              class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
            ></textarea>
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
              placeholder="What this program is about"
              class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
            ></textarea>
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="starting_point_description" class="text-sm font-medium"
              >Starting point</label
            >
            <textarea
              id="starting_point_description"
              name="starting_point_description"
              rows={2}
              maxlength={4000}
              placeholder="Honest snapshot of where you are now"
              class="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 min-h-[4rem] w-full resize-y rounded-2xl border px-3 py-2 text-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
            ></textarea>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <CalendarDatePicker
              name="target_start_date"
              id="program-target-start"
              label="Target start"
            />
            <CalendarDatePicker
              name="target_end_date"
              id="program-target-end"
              label="Target end"
            />
          </div>

          <Button type="submit" class="w-full sm:w-auto" disabled={creating}>
            {creating ? "Creating…" : "Create & configure"}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</main>
