<script lang="ts">
  import { browser } from "$app/environment";
  import { resolve } from "$app/paths";
  import { onDestroy, onMount } from "svelte";
  import { clearAllLearningCaches } from "$lib/cache/learningDataCache";
  import { supabase } from "$lib/supabaseClient";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Drawer from "$lib/components/ui/drawer";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";

  import { toggleMode } from "mode-watcher";

  let { data, children } = $props();

  onMount(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearAllLearningCaches();
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  });

  type TimerMode = "focus" | "rest";

  const STORAGE_KEY = "tidy:pomodoro-config:v1";
  const DEFAULT_FOCUS_MINUTES = 25;
  const DEFAULT_REST_MINUTES = 5;
  const DEFAULT_CYCLES = 4;

  let mode = $state<TimerMode>("focus");
  let isRunning = $state(false);
  let secondsLeft = $state(DEFAULT_FOCUS_MINUTES * 60);

  let focusMinutes = $state(DEFAULT_FOCUS_MINUTES);
  let restMinutes = $state(DEFAULT_REST_MINUTES);
  let cyclesTarget = $state(DEFAULT_CYCLES);
  let completedCycles = $state(0);
  let draftFocusMinutes = $state(DEFAULT_FOCUS_MINUTES);
  let draftRestMinutes = $state(DEFAULT_REST_MINUTES);
  let draftCyclesTarget = $state(DEFAULT_CYCLES);
  let settingsOpen = $state(false);
  let intervalId: number | null = null;
  let toastApi = $state<any>(null);

  const modeLabel = $derived(mode === "focus" ? "Focus" : "Rest");
  const cyclesLabel = $derived(`${completedCycles}/${cyclesTarget} cycles`);
  const timerPanelClass = $derived(
    mode === "focus"
      ? "mt-1 flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3 sm:px-4 bg-primary/5 border-primary/20"
      : "mt-1 flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3 sm:px-4 bg-chart-2/8 border-chart-2/25",
  );
  const modeBadgeClass = $derived(
    mode === "focus"
      ? "rounded-full border-primary/40 bg-primary/15 px-2.5 py-0.5 text-[11px] tracking-wide text-primary uppercase"
      : "rounded-full border-chart-2/35 bg-chart-2/15 px-2.5 py-0.5 text-[11px] tracking-wide text-chart-2 uppercase",
  );
  const formattedTime = $derived.by(() => {
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  });

  function clampMinutes(value: number) {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(180, Math.round(value)));
  }

  function clampCycles(value: number) {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(20, Math.round(value)));
  }

  async function getToast() {
    if (!browser) return null;
    if (toastApi) return toastApi;
    const mod = await import("svelte-sonner");
    toastApi = mod.toast;
    return toastApi;
  }

  function applyMode(nextMode: TimerMode) {
    mode = nextMode;
    secondsLeft = (nextMode === "focus" ? focusMinutes : restMinutes) * 60;
  }

  function resetTimer() {
    stopTimerInterval();
    isRunning = false;
    completedCycles = 0;
    applyMode("focus");
  }

  function notifyPhaseStart(nextMode: TimerMode) {
    if (!browser || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const title =
      nextMode === "focus" ? "Focus session started" : "Rest session started";
    const body =
      nextMode === "focus"
        ? `Back to focus for ${focusMinutes} minutes.`
        : `Time to rest for ${restMinutes} minutes.`;
    new Notification(title, { body });
  }

  function notifyCyclesCompleted() {
    if (!browser || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    new Notification("Pomodoro cycles complete", {
      body: `You completed ${cyclesTarget} focus cycles.`,
    });
  }

  function stopTimerInterval() {
    if (intervalId === null) return;
    window.clearInterval(intervalId);
    intervalId = null;
  }

  function startTimerInterval() {
    if (!browser || intervalId !== null) return;
    intervalId = window.setInterval(() => {
      if (secondsLeft <= 1) {
        if (mode === "focus") {
          completedCycles += 1;
          if (completedCycles >= cyclesTarget) {
            stopTimerInterval();
            isRunning = false;
            applyMode("focus");
            notifyCyclesCompleted();
            void getToast().then((toast) => {
              toast?.success("Cycle goal complete. Great work.", {
                position: "top-center",
              });
            });
            return;
          }
        }
        const nextMode: TimerMode = mode === "focus" ? "rest" : "focus";
        applyMode(nextMode);
        notifyPhaseStart(nextMode);
        void getToast().then((toast) => {
          const message =
            nextMode === "rest"
              ? `Focus complete. Start your ${restMinutes} minute rest.`
              : `Rest complete. Back to ${focusMinutes} minutes of focus.`;
          toast?.info(message, { position: "top-center" });
        });
        return;
      }
      secondsLeft -= 1;
    }, 1000);
  }

  function toggleStartPause() {
    if (!isRunning && browser) {
      if (!("Notification" in window)) {
        void getToast().then((toast) => {
          toast?.warning("Browser notifications are not supported here.", {
            position: "top-center",
          });
        });
      } else if (Notification.permission === "default") {
        void Notification.requestPermission().then((permission) => {
          void getToast().then((toast) => {
            if (permission === "granted") {
              toast?.success("Notifications enabled for Pomodoro updates.", {
                position: "top-center",
              });
            } else {
              toast?.warning(
                "Notifications are off. Timer still works normally.",
                {
                  position: "top-center",
                },
              );
            }
          });
        });
      } else if (Notification.permission === "denied") {
        void getToast().then((toast) => {
          toast?.warning("Notifications are blocked in browser settings.", {
            position: "top-center",
          });
        });
      }
    }
    if (isRunning) {
      stopTimerInterval();
      isRunning = false;
      return;
    }
    isRunning = true;
    startTimerInterval();
  }

  function saveSettings() {
    focusMinutes = clampMinutes(draftFocusMinutes);
    restMinutes = clampMinutes(draftRestMinutes);
    cyclesTarget = clampCycles(draftCyclesTarget);
    if (browser) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ focusMinutes, restMinutes, cyclesTarget }),
      );
    }
    settingsOpen = false;
    resetTimer();
  }

  if (browser) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object") {
          const nextFocus = clampMinutes(
            Number((parsed as { focusMinutes?: unknown }).focusMinutes),
          );
          const nextRest = clampMinutes(
            Number((parsed as { restMinutes?: unknown }).restMinutes),
          );
          const nextCycles = clampCycles(
            Number((parsed as { cyclesTarget?: unknown }).cyclesTarget),
          );
          focusMinutes = nextFocus;
          restMinutes = nextRest;
          cyclesTarget = nextCycles;
          draftFocusMinutes = nextFocus;
          draftRestMinutes = nextRest;
          draftCyclesTarget = nextCycles;
          secondsLeft = nextFocus * 60;
        }
      } catch {
        // Ignore invalid persisted values.
      }
    }
  }

  onDestroy(() => {
    if (!browser) return;
    stopTimerInterval();
  });
</script>

<div class="mx-auto w-full max-w-5xl px-4 py-8 md:py-12">
  <header
    class="border-border/80 mb-8 flex flex-wrap items-center justify-between gap-3 border-b pb-6"
  >
    <a
      href={resolve("/programs")}
      class="text-primary text-xs font-semibold tracking-widest uppercase"
      >Tidy</a
    >
    <nav class="flex flex-wrap items-center gap-2 sm:gap-3">
      <a
        href={resolve("/programs")}
        class="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >Programs</a
      >
      <a
        href={resolve("/todo")}
        class="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >Tasks</a
      >
      <a
        href={resolve("/calendar")}
        class="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >Calendar</a
      >
      <a
        href={resolve("/today")}
        class="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >Today</a
      >
      <a
        href={resolve("/settings/availability")}
        class="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >Hours</a
      >
      <span
        class="text-muted-foreground hidden max-w-[14rem] truncate text-sm sm:inline"
        >{data.user?.email ?? ""}</span
      >
      <Button onclick={toggleMode} variant="outline" size="icon">
        <SunIcon
          class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 !transition-all dark:scale-0 dark:-rotate-90"
        />
        <MoonIcon
          class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 !transition-all dark:scale-100 dark:rotate-0"
        />
        <span class="sr-only">Toggle theme</span>
      </Button>
      <form
        method="POST"
        action="/auth/signout"
        class="inline"
        onsubmit={() => clearAllLearningCaches()}
      >
        <Button type="submit" variant="outline" size="sm">Sign out</Button>
      </form>
    </nav>

    <section class={timerPanelClass}>
      <div class="flex items-center gap-2">
        <Badge class={modeBadgeClass} variant="outline">
          {modeLabel}
        </Badge>
        <Badge
          variant="secondary"
          class="rounded-full px-2.5 py-0.5 text-[11px]"
        >
          {cyclesLabel}
        </Badge>
        <p
          class="text-foreground text-lg font-semibold tabular-nums sm:text-xl"
        >
          {formattedTime}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button onclick={toggleStartPause}>
          {isRunning ? "Pause" : "Start"}
        </Button>
        <Button variant="outline" onclick={resetTimer}>Reset</Button>

        <Drawer.Root bind:open={settingsOpen}>
          <Drawer.Trigger
            class="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-11 min-w-11 items-center justify-center rounded-4xl border px-4 text-sm font-medium transition-colors"
          >
            Settings
          </Drawer.Trigger>
          <Drawer.Content>
            <div class="mx-auto w-full max-w-xl">
              <Drawer.Header
                class="mx-auto w-full max-w-md space-y-1.5 px-4 pt-2 text-left"
              >
                <Drawer.Title
                  class="text-foreground text-lg font-semibold tracking-tight"
                >
                  Pomodoro settings
                </Drawer.Title>
                <Drawer.Description class="text-muted-foreground text-sm">
                  Configure focus/rest intervals and cycle goal. Saving restarts
                  the timer.
                </Drawer.Description>
              </Drawer.Header>

              <div class="mx-auto w-full max-w-md px-4 py-4">
                <div
                  class="rounded-xl border border-border/70 bg-background/70 p-4 sm:p-5"
                >
                  <div class="grid gap-4 sm:gap-5">
                    <div class="grid gap-2.5">
                      <label
                        class="text-foreground text-sm font-medium"
                        for="focus-minutes"
                      >
                        Focus minutes
                      </label>
                      <Input
                        id="focus-minutes"
                        type="number"
                        min={1}
                        max={180}
                        bind:value={draftFocusMinutes}
                      />
                    </div>

                    <div class="grid gap-2.5">
                      <label
                        class="text-foreground text-sm font-medium"
                        for="rest-minutes"
                      >
                        Rest minutes
                      </label>
                      <Input
                        id="rest-minutes"
                        type="number"
                        min={1}
                        max={180}
                        bind:value={draftRestMinutes}
                      />
                    </div>

                    <div class="grid gap-2.5">
                      <label
                        class="text-foreground text-sm font-medium"
                        for="cycle-target"
                      >
                        Number of cycles
                      </label>
                      <Input
                        id="cycle-target"
                        type="number"
                        min={1}
                        max={20}
                        bind:value={draftCyclesTarget}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Drawer.Footer
                class="mx-auto w-full max-w-md px-4 pb-5 pt-1 sm:flex-row sm:justify-end sm:gap-2"
              >
                <Button
                  class="h-11 w-full sm:w-auto sm:min-w-28"
                  onclick={saveSettings}>Save</Button
                >
                <Drawer.Close
                  class="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-11 w-full items-center justify-center rounded-4xl border px-4 text-sm font-medium transition-colors sm:w-auto sm:min-w-28"
                >
                  Cancel
                </Drawer.Close>
              </Drawer.Footer>
            </div>
          </Drawer.Content>
        </Drawer.Root>
      </div>
    </section>
  </header>
  {@render children()}
</div>
