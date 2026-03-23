<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { createTodo, STORAGE_KEY, type Todo } from "$lib/todo";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import type { PageProps } from "./$types";

  let todos = $state<Todo[]>([]);
  let ready = $state(false);
  let input = $state("");
  let filter = $state<"all" | "active" | "completed">("all");

  const filtered = $derived.by(() => {
    if (filter === "active") return todos.filter((t) => !t.done);
    if (filter === "completed") return todos.filter((t) => t.done);
    return todos;
  });

  const activeCount = $derived(todos.filter((t) => !t.done).length);
  const completedCount = $derived(todos.filter((t) => t.done).length);
  let { data }: PageProps = $props();

  onMount(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          todos = parsed.filter(
            (t): t is Todo =>
              t &&
              typeof t === "object" &&
              "id" in t &&
              "title" in t &&
              "done" in t &&
              typeof (t as Todo).id === "string" &&
              typeof (t as Todo).title === "string" &&
              typeof (t as Todo).done === "boolean",
          );
        }
      } catch {
        /* ignore corrupt storage */
      }
    }
    ready = true;
  });

  $effect(() => {
    if (!browser || !ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  });

  function addTodo() {
    const title = input.trim();
    if (!title) return;
    todos = [createTodo(title), ...todos];
    input = "";
  }

  function toggle(id: string) {
    todos = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  }

  function remove(id: string) {
    todos = todos.filter((t) => t.id !== id);
  }

  function clearCompleted() {
    todos = todos.filter((t) => !t.done);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTodo();
    }
  }
</script>

<main class="flex flex-col gap-6">
  <header class="text-center">
    <p
      class="text-primary mb-1 text-xs font-semibold tracking-widest uppercase"
    >
      Tidy
    </p>
    <h1
      class="text-foreground text-3xl font-semibold tracking-tight md:text-4xl"
    >
      Tasks
    </h1>
    <p
      class="text-muted-foreground mx-auto mt-2 max-w-[36ch] text-sm leading-relaxed"
    >
      Add items, check them off, stay organized. Saved in this browser.
    </p>
  </header>

  <ul>
    {#each data.instruments as instrument}
      <li>{instrument.name}</li>
    {/each}
  </ul>

  <Card>
    <CardHeader class="pb-4">
      <CardTitle class="text-lg">New task</CardTitle>
      <CardDescription>Press Enter or use Add to create a task.</CardDescription
      >
    </CardHeader>
    <CardContent class="pt-0">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          class="flex-1"
          type="text"
          bind:value={input}
          onkeydown={onKeydown}
          placeholder="What needs doing?"
          aria-label="Task title"
          autocomplete="off"
        />
        <Button
          class="shrink-0 sm:w-auto"
          onclick={addTodo}
          disabled={!input.trim()}
        >
          Add
        </Button>
      </div>
    </CardContent>
  </Card>

  {#if todos.length > 0}
    <Card>
      <CardHeader class="space-y-4 pb-2">
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <ToggleGroup.Root
            type="single"
            bind:value={filter}
            variant="outline"
            spacing={0}
            class="justify-start"
          >
            <ToggleGroup.Item value="all" aria-label="Show all tasks"
              >All</ToggleGroup.Item
            >
            <ToggleGroup.Item value="active" aria-label="Show active tasks"
              >Active</ToggleGroup.Item
            >
            <ToggleGroup.Item
              value="completed"
              aria-label="Show completed tasks">Done</ToggleGroup.Item
            >
          </ToggleGroup.Root>
          <div
            class="text-muted-foreground flex flex-wrap items-center gap-2 text-xs sm:justify-end"
          >
            <Badge variant="secondary" class="tabular-nums font-semibold"
              >{activeCount} active</Badge
            >
            {#if completedCount > 0}
              <Badge variant="outline" class="tabular-nums border-border/80">
                {completedCount} done
              </Badge>
            {/if}
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent class="pt-6">
        <ul class="max-h-[min(55vh,420px)] space-y-0 overflow-y-auto">
          {#each filtered as todo (todo.id)}
            <li
              class="border-border/80 flex items-start gap-3 border-b py-3 last:border-b-0"
            >
              <Checkbox
                id="todo-{todo.id}"
                checked={todo.done}
                onCheckedChange={() => toggle(todo.id)}
                class="mt-0.5"
              />
              <label
                for="todo-{todo.id}"
                class="text-foreground flex-1 cursor-pointer pt-0.5 text-sm leading-snug select-none"
                class:line-through={todo.done}
                class:text-muted-foreground={todo.done}
              >
                {todo.title}
              </label>
              <Button
                variant="ghost"
                size="sm"
                class="text-muted-foreground hover:text-destructive shrink-0"
                onclick={() => remove(todo.id)}
                aria-label="Remove {todo.title}"
              >
                Remove
              </Button>
            </li>
          {/each}
        </ul>

        {#if filtered.length === 0}
          <p class="text-muted-foreground py-6 text-center text-sm">
            {#if filter === "active"}
              No active tasks. Nice work.
            {:else if filter === "completed"}
              No completed tasks yet.
            {:else}
              No tasks.
            {/if}
          </p>
        {/if}

        {#if completedCount > 0}
          <div class="mt-4 flex justify-end border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              class="text-destructive hover:text-destructive"
              onclick={clearCompleted}
            >
              Clear completed
            </Button>
          </div>
        {/if}
      </CardContent>
    </Card>
  {:else if ready}
    <p class="text-muted-foreground text-center text-sm">
      Nothing here yet. Add your first task above.
    </p>
  {/if}
</main>
