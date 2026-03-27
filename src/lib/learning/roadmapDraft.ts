import { modulesInTreeOrder } from "$lib/learning/moduleFlowLayout";
import type {
  LearningModuleRow,
  LearningSessionRow,
  ModuleLifecycleState,
} from "$lib/learning/types";

export const TEMP_MODULE_PREFIX = "tmp-mod-";
export const TEMP_SESSION_PREFIX = "tmp-ses-";

export function isTempModuleId(id: string): boolean {
  return id.startsWith(TEMP_MODULE_PREFIX);
}

export function isTempSessionId(id: string): boolean {
  return id.startsWith(TEMP_SESSION_PREFIX);
}

export function newTempModuleId(): string {
  return `${TEMP_MODULE_PREFIX}${crypto.randomUUID()}`;
}

export function newTempSessionId(): string {
  return `${TEMP_SESSION_PREFIX}${crypto.randomUUID()}`;
}

export function collectDescendantModuleIds(
  modules: LearningModuleRow[],
  rootId: string,
): string[] {
  const byParent = new Map<string | null, string[]>();
  for (const m of modules) {
    const p = m.parent_module_id ?? null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(m.id);
  }
  const out: string[] = [];
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    out.push(id);
    const kids = byParent.get(id);
    if (kids) stack.push(...kids);
  }
  return out;
}

export function createDefaultSessionDraft(
  moduleId: string,
  todayIso: string,
  sortOrder: number,
): LearningSessionRow {
  return {
    id: newTempSessionId(),
    learning_module_id: moduleId,
    name: "",
    session_type: "study",
    sort_order: sortOrder,
    planned_start_date: todayIso,
    planned_end_date: todayIso,
    scheduled_start_at: null,
    scheduled_end_at: null,
    status: "planned",
    actual_started_at: null,
    actual_completed_at: null,
    estimated_duration_minutes: null,
    notes: null,
    created_at: "",
    updated_at: "",
  };
}

export function cloneRoadmapFromData(
  modules: LearningModuleRow[],
  sessionsByModule: Record<string, LearningSessionRow[]>,
): {
  modules: LearningModuleRow[];
  sessionsByModule: Record<string, LearningSessionRow[]>;
} {
  return {
    modules: modules.map((m) => ({ ...m })),
    sessionsByModule: Object.fromEntries(
      Object.entries(sessionsByModule).map(([k, v]) => [
        k,
        v.map((s) => ({ ...s })),
      ]),
    ),
  };
}

export function validateRoadmapTree(modules: LearningModuleRow[]): string | null {
  if (modules.length === 0) {
    return "Add at least one module to the roadmap.";
  }
  const byId = new Map(modules.map((m) => [m.id, m]));
  const roots = modules.filter((m) => !m.parent_module_id);
  if (roots.length !== 1) {
    return "The roadmap must have exactly one root module. Connect modules into one tree with a single root.";
  }
  for (const m of modules) {
    if (!m.parent_module_id) continue;
    if (!byId.has(m.parent_module_id)) {
      return `Module “${m.title}” points to a missing parent.`;
    }
  }
  for (const start of modules) {
    const seen = new Set<string>();
    let cur: string | undefined = start.id;
    for (let i = 0; i < modules.length + 2; i++) {
      const step: LearningModuleRow | undefined = cur ? byId.get(cur) : undefined;
      if (!step) break;
      if (seen.has(step.id)) return "The module tree has a cycle.";
      seen.add(step.id);
      cur = step.parent_module_id ?? undefined;
      if (!cur) break;
    }
  }
  return null;
}

export type RoadmapSnapshotPayload = {
  modules: Array<{
    id: string;
    title: string;
    description: string | null;
    parent_module_id: string | null;
    sort_order: number;
    module_state?: ModuleLifecycleState | null;
    started_at?: string | null;
    completed_at: string | null;
  }>;
  sessions: Array<{
    id: string;
    learning_module_id: string;
    name: string;
    session_type: LearningSessionRow["session_type"];
    sort_order: number;
    planned_start_date: string;
    planned_end_date: string;
    scheduled_start_at?: string | null;
    scheduled_end_at?: string | null;
    status: LearningSessionRow["status"];
    estimated_duration_minutes: number | null;
    notes: string | null;
    actual_started_at: string | null;
    actual_completed_at: string | null;
  }>;
};

export function buildRoadmapSnapshot(
  modules: LearningModuleRow[],
  sessionsByModule: Record<string, LearningSessionRow[]>,
): RoadmapSnapshotPayload {
  const sortedMods = [...modules].sort((a, b) => a.sort_order - b.sort_order);
  const sessions: RoadmapSnapshotPayload["sessions"] = [];
  for (const m of sortedMods) {
    const list = sessionsByModule[m.id] ?? [];
    const sorted = [...list].sort((a, b) => a.sort_order - b.sort_order);
    for (const s of sorted) {
      sessions.push({
        id: s.id,
        learning_module_id: s.learning_module_id,
        name: s.name,
        session_type: s.session_type,
        sort_order: s.sort_order,
        planned_start_date: s.planned_start_date,
        planned_end_date: s.planned_end_date,
        scheduled_start_at: s.scheduled_start_at ?? null,
        scheduled_end_at: s.scheduled_end_at ?? null,
        status: s.status,
        estimated_duration_minutes: s.estimated_duration_minutes,
        notes: s.notes,
        actual_started_at: s.actual_started_at,
        actual_completed_at: s.actual_completed_at,
      });
    }
  }
  return {
    modules: sortedMods.map((m) => ({
      id: m.id,
      title: m.title.trim(),
      description: m.description?.trim() ? m.description.trim() : null,
      parent_module_id: m.parent_module_id ?? null,
      sort_order: m.sort_order,
      module_state: m.module_state ?? null,
      started_at: m.started_at ?? null,
      completed_at: m.completed_at ?? null,
    })),
    sessions,
  };
}

export function snapshotPayloadJson(
  modules: LearningModuleRow[],
  sessionsByModule: Record<string, LearningSessionRow[]>,
): string {
  return JSON.stringify(buildRoadmapSnapshot(modules, sessionsByModule));
}

/**
 * Reassign `sort_order` uniquely per program. The DB enforces uniqueness on
 * `(learning_program_id, sort_order)` (see `learning_modules_sort_unique`), so
 * orders cannot be scoped only to siblings.
 */
export function reindexModuleSortOrders(modules: LearningModuleRow[]): LearningModuleRow[] {
  const ordered = modulesInTreeOrder(modules);
  const orderById = new Map<string, number>();
  ordered.forEach((m, i) => orderById.set(m.id, i));
  return modules.map((m) => ({ ...m, sort_order: orderById.get(m.id)! }));
}

export function reindexSessionSortOrders(
  sessionsByModule: Record<string, LearningSessionRow[]>,
): Record<string, LearningSessionRow[]> {
  const out: Record<string, LearningSessionRow[]> = {};
  for (const [mid, list] of Object.entries(sessionsByModule)) {
    const sorted = [...list].sort((a, b) => a.sort_order - b.sort_order);
    out[mid] = sorted.map((s, i) => ({ ...s, sort_order: i }));
  }
  return out;
}

