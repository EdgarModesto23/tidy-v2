import type { LearningSessionRow, ModuleLifecycleState } from "$lib/learning/types";

export type CalendarSessionItem = {
  id: string;
  learning_module_id: string;
  name: string;
  session_type: LearningSessionRow["session_type"];
  sort_order: number;
  planned_start_date: string;
  planned_end_date: string;
  status: LearningSessionRow["status"];
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  estimated_duration_minutes: number | null;
  module_title: string;
  module_state: ModuleLifecycleState;
  program_id: string;
  program_name: string;
};

export function parseUserSessionsInRangeRpc(raw: unknown):
  | { ok: true; sessions: CalendarSessionItem[] }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid" };
  }
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) {
    return { ok: false, error: typeof o.error === "string" ? o.error : "error" };
  }
  const list = o.sessions;
  if (!Array.isArray(list)) {
    return { ok: false, error: "invalid_sessions" };
  }
  const sessions: CalendarSessionItem[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = r.id;
    const learning_module_id = r.learning_module_id;
    const name = r.name;
    const program_id = r.program_id;
    const program_name = r.program_name;
    const module_title = r.module_title;
    if (
      typeof id !== "string" ||
      typeof learning_module_id !== "string" ||
      typeof name !== "string" ||
      typeof program_id !== "string" ||
      typeof program_name !== "string" ||
      typeof module_title !== "string"
    ) {
      continue;
    }
    const ms = r.module_state;
    const module_state =
      ms === "pending" || ms === "started" || ms === "completed" ? ms : "pending";
    sessions.push({
      id,
      learning_module_id,
      name,
      session_type: r.session_type as LearningSessionRow["session_type"],
      sort_order: Number(r.sort_order) || 0,
      planned_start_date: String(r.planned_start_date ?? ""),
      planned_end_date: String(r.planned_end_date ?? ""),
      status: r.status as LearningSessionRow["status"],
      scheduled_start_at:
        r.scheduled_start_at == null ? null : String(r.scheduled_start_at),
      scheduled_end_at:
        r.scheduled_end_at == null ? null : String(r.scheduled_end_at),
      estimated_duration_minutes:
        r.estimated_duration_minutes == null
          ? null
          : Number(r.estimated_duration_minutes),
      module_title,
      module_state,
      program_id,
      program_name,
    });
  }
  return { ok: true, sessions };
}
