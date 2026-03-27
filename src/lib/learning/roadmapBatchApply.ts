import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoadmapSnapshotPayload } from "$lib/learning/roadmapDraft";
import type {
  LearningSessionStatus,
  LearningSessionType,
} from "$lib/learning/types";
import { isUuid } from "$lib/learning/uuid";

function parseSessionType(v: string): LearningSessionType | null {
  if (
    v === "test" ||
    v === "study" ||
    v === "drill" ||
    v === "project" ||
    v === "flashcard_session"
  ) {
    return v;
  }
  return null;
}

function parseSessionStatus(v: string): LearningSessionStatus | null {
  if (
    v === "planned" ||
    v === "in_progress" ||
    v === "completed" ||
    v === "skipped" ||
    v === "deferred"
  ) {
    return v;
  }
  return null;
}

type ModulePayload = RoadmapSnapshotPayload["modules"][number];

function payloadHasCycle(modules: ModulePayload[]): boolean {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  function walk(id: string): boolean {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const m = byId.get(id);
    if (m?.parent_module_id) {
      if (walk(m.parent_module_id)) return true;
    }
    visiting.delete(id);
    done.add(id);
    return false;
  }
  for (const m of modules) {
    if (walk(m.id)) return true;
  }
  return false;
}

function moduleDepth(
  id: string,
  byId: Map<string, ModulePayload>,
  memo: Map<string, number>,
): number {
  if (memo.has(id)) return memo.get(id)!;
  const m = byId.get(id);
  if (!m) {
    memo.set(id, 0);
    return 0;
  }
  if (!m.parent_module_id) {
    memo.set(id, 0);
    return 0;
  }
  const d = 1 + moduleDepth(m.parent_module_id, byId, memo);
  memo.set(id, d);
  return d;
}

function sortModulesForDelete(
  dbModules: { id: string; parent_module_id: string | null }[],
  deleteIds: Set<string>,
): string[] {
  const byId = new Map(dbModules.map((m) => [m.id, m]));
  function depth(id: string): number {
    let d = 0;
    let cur: string | null | undefined = id;
    for (let i = 0; i < dbModules.length + 2; i++) {
      const row: { id: string; parent_module_id: string | null } | undefined = cur
        ? byId.get(cur)
        : undefined;
      if (!row) break;
      d++;
      cur = row.parent_module_id;
      if (!cur) break;
    }
    return d;
  }
  return [...deleteIds].sort((a, b) => depth(b) - depth(a));
}

/**
 * Shift every module's `sort_order` by a large offset so subsequent per-row updates to
 * final 0..n-1 values never hit a duplicate `(learning_program_id, sort_order)` while
 * Postgres applies each UPDATE (e.g. reparenting can reorder the whole tree).
 */
const SORT_ORDER_STAGE_OFFSET = 1_000_000;

async function stageModuleSortOrdersBeforeUuidUpdates(
  supabase: SupabaseClient,
  programId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: rows, error: fetchErr } = await supabase
    .from("learning_modules")
    .select("id, sort_order")
    .eq("learning_program_id", programId);

  if (fetchErr || !rows) {
    return {
      ok: false,
      message: fetchErr?.message ?? "Could not load modules for sort staging.",
    };
  }

  for (const row of rows) {
    const base = Number(row.sort_order ?? 0);
    const { error: upErr } = await supabase
      .from("learning_modules")
      .update({ sort_order: base + SORT_ORDER_STAGE_OFFSET })
      .eq("id", row.id)
      .eq("learning_program_id", programId);

    if (upErr) return { ok: false, message: upErr.message };
  }
  return { ok: true };
}

/**
 * Applies a full roadmap snapshot: deletes removed rows, inserts temps, updates the rest.
 */
export async function applyRoadmapBatch(
  supabase: SupabaseClient,
  programId: string,
  payload: RoadmapSnapshotPayload,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: dbMods, error: dbModsErr } = await supabase
    .from("learning_modules")
    .select("id, parent_module_id")
    .eq("learning_program_id", programId);

  if (dbModsErr || !dbMods) {
    return { ok: false, message: dbModsErr?.message ?? "Could not load modules." };
  }

  const dbModuleIds = new Set(dbMods.map((m) => m.id));

  let sessionsSafe: { id: string; learning_module_id: string }[] = [];
  if (dbModuleIds.size > 0) {
    const { data: dbSessRows, error: dbSessErr } = await supabase
      .from("learning_sessions")
      .select("id, learning_module_id")
      .in("learning_module_id", [...dbModuleIds]);

    if (dbSessErr) {
      return { ok: false, message: dbSessErr.message };
    }
    sessionsSafe = dbSessRows ?? [];
  }

  const payloadModById = new Map(payload.modules.map((m) => [m.id, m]));
  const payloadModUuids = new Set(
    payload.modules.filter((m) => isUuid(m.id)).map((m) => m.id),
  );

  for (const m of payload.modules) {
    if (!m.title.trim()) {
      return { ok: false, message: "Every module needs a title." };
    }
  }

  const roots = payload.modules.filter((m) => !m.parent_module_id);
  if (payload.modules.length > 0 && roots.length !== 1) {
    return {
      ok: false,
      message:
        "The roadmap must have exactly one root module (no parent). Fix connections and try again.",
    };
  }

  if (payload.modules.length > 0 && payloadHasCycle(payload.modules)) {
    return { ok: false, message: "The module tree has a cycle." };
  }

  const toDeleteModIds = new Set(
    [...dbModuleIds].filter((id) => !payloadModUuids.has(id)),
  );

  const payloadSessUuids = new Set(
    payload.sessions.filter((s) => isUuid(s.id)).map((s) => s.id),
  );
  const toDeleteSessIds = new Set(
    sessionsSafe.map((s) => s.id).filter((id) => !payloadSessUuids.has(id)),
  );

  for (const s of payload.sessions) {
    const st = parseSessionType(s.session_type);
    const stat = parseSessionStatus(s.status);
    if (!st || !stat) {
      return { ok: false, message: "Invalid session type or status." };
    }
    if (!s.name.trim()) {
      return { ok: false, message: "Every session needs a name." };
    }
    if (!s.planned_start_date || !s.planned_end_date) {
      return { ok: false, message: "Sessions need planned start and end dates." };
    }
  }

  for (const id of toDeleteSessIds) {
    const { error: e } = await supabase.from("learning_sessions").delete().eq("id", id);
    if (e) return { ok: false, message: e.message };
  }

  const deleteOrder = sortModulesForDelete(dbMods, toDeleteModIds);
  for (const id of deleteOrder) {
    const { error: e } = await supabase.from("learning_modules").delete().eq("id", id);
    if (e) return { ok: false, message: e.message };
  }

  const survivingDbIds = new Set(
    [...dbModuleIds].filter((id) => !toDeleteModIds.has(id)),
  );

  const tempToReal = new Map<string, string>();
  const remaining = new Set(
    payload.modules.filter((m) => !isUuid(m.id)).map((m) => m.id),
  );

  let guard = 0;
  while (remaining.size > 0 && guard++ < 500) {
    let progressed = false;
    for (const id of [...remaining]) {
      const m = payloadModById.get(id)!;
      const pref = m.parent_module_id ?? null;

      if (pref !== null) {
        if (!isUuid(pref)) {
          if (remaining.has(pref)) continue;
          if (!tempToReal.has(pref)) {
            return { ok: false, message: "Invalid parent reference for a new module." };
          }
        } else if (!survivingDbIds.has(pref)) {
          return { ok: false, message: "Parent module does not exist." };
        }
      }

      let insertParent: string | null;
      if (pref === null) {
        insertParent = null;
      } else if (isUuid(pref)) {
        insertParent = pref;
      } else {
        const mapped = tempToReal.get(pref);
        if (!mapped) continue;
        insertParent = mapped;
      }

      const now = new Date().toISOString();
      const { data: inserted, error: insErr } = await supabase
        .from("learning_modules")
        .insert({
          learning_program_id: programId,
          parent_module_id: insertParent,
          title: m.title.trim(),
          description: m.description,
          sort_order: m.sort_order,
          completed_at: m.completed_at,
          updated_at: now,
        })
        .select("id")
        .single();

      if (insErr || !inserted) {
        return { ok: false, message: insErr?.message ?? "Could not create module." };
      }

      tempToReal.set(id, inserted.id);
      survivingDbIds.add(inserted.id);
      remaining.delete(id);
      progressed = true;
    }
    if (!progressed) {
      return { ok: false, message: "Could not insert new modules (check parent links)." };
    }
  }

  const staged = await stageModuleSortOrdersBeforeUuidUpdates(supabase, programId);
  if (!staged.ok) return staged;

  const uuidUpdates = payload.modules.filter((m) => isUuid(m.id));
  const depthMemo = new Map<string, number>();
  const byPayloadId = new Map(payload.modules.map((m) => [m.id, m]));
  uuidUpdates.sort(
    (a, b) =>
      moduleDepth(b.id, byPayloadId, depthMemo) -
      moduleDepth(a.id, byPayloadId, depthMemo),
  );

  for (const m of uuidUpdates) {
    if (!survivingDbIds.has(m.id)) {
      return { ok: false, message: "Unknown module id in payload." };
    }

    let parentId: string | null = m.parent_module_id ?? null;
    if (parentId !== null && !isUuid(parentId)) {
      const r = tempToReal.get(parentId);
      if (!r) return { ok: false, message: "Invalid parent for module update." };
      parentId = r;
    }
    if (parentId !== null && !survivingDbIds.has(parentId)) {
      return { ok: false, message: "Invalid parent for module update." };
    }

    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("learning_modules")
      .update({
        parent_module_id: parentId,
        title: m.title.trim(),
        description: m.description,
        sort_order: m.sort_order,
        completed_at: m.completed_at,
        updated_at: now,
      })
      .eq("id", m.id)
      .eq("learning_program_id", programId);

    if (upErr) return { ok: false, message: upErr.message };
  }

  function resolveModuleId(ref: string): string | null {
    if (isUuid(ref)) return ref;
    return tempToReal.get(ref) ?? null;
  }

  const newSessions = payload.sessions.filter((s) => !isUuid(s.id));
  const uuidSessions = payload.sessions.filter((s) => isUuid(s.id));

  for (const s of newSessions) {
    const mid = resolveModuleId(s.learning_module_id);
    if (!mid) {
      return { ok: false, message: "Could not resolve module for a new session." };
    }
    if (!survivingDbIds.has(mid)) {
      return { ok: false, message: "Invalid module for a new session." };
    }

    const st = parseSessionType(s.session_type);
    const stat = parseSessionStatus(s.status);
    if (!st || !stat) return { ok: false, message: "Invalid session." };

    const now = new Date().toISOString();
    const { error: se } = await supabase.from("learning_sessions").insert({
      learning_module_id: mid,
      name: s.name.trim(),
      session_type: st,
      sort_order: s.sort_order,
      planned_start_date: s.planned_start_date,
      planned_end_date: s.planned_end_date,
      status: stat,
      estimated_duration_minutes: s.estimated_duration_minutes,
      notes: s.notes,
      actual_started_at: s.actual_started_at,
      actual_completed_at: s.actual_completed_at,
      updated_at: now,
    });

    if (se) return { ok: false, message: se.message };
  }

  for (const s of uuidSessions) {
    const mid = resolveModuleId(s.learning_module_id);
    if (!mid) {
      return { ok: false, message: "Could not resolve module for session update." };
    }
    if (!survivingDbIds.has(mid)) {
      return { ok: false, message: "Invalid module for session update." };
    }

    const st = parseSessionType(s.session_type);
    const stat = parseSessionStatus(s.status);
    if (!st || !stat) return { ok: false, message: "Invalid session." };

    const now = new Date().toISOString();
    const { error: ue } = await supabase
      .from("learning_sessions")
      .update({
        learning_module_id: mid,
        name: s.name.trim(),
        session_type: st,
        sort_order: s.sort_order,
        planned_start_date: s.planned_start_date,
        planned_end_date: s.planned_end_date,
        status: stat,
        estimated_duration_minutes: s.estimated_duration_minutes,
        notes: s.notes,
        actual_started_at: s.actual_started_at,
        actual_completed_at: s.actual_completed_at,
        updated_at: now,
      })
      .eq("id", s.id);

    if (ue) return { ok: false, message: ue.message };
  }

  return { ok: true };
}
