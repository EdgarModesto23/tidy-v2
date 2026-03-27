import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserAvailabilityWindowRow } from "$lib/learning/types";
import {
  getZonedParts,
  localWallTimeToUtc,
  weekdaySun0,
} from "$lib/learning/timezone";

const STEP_MS = 15 * 60 * 1000;
const DEFAULT_DURATION_MIN = 45;
const MAX_SEARCH_MS = 366 * 24 * 60 * 60 * 1000;

function parseTimeToMinutes(t: string): { h: number; m: number } {
  const parts = t.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  return { h, m };
}

function sessionFitsInWindow(
  t: number,
  durationMs: number,
  w: UserAvailabilityWindowRow,
): boolean {
  if (durationMs <= 0) return false;
  const durationMinutes = Math.max(1, Math.round(durationMs / 60000));
  const dow = weekdaySun0(t, w.timezone);
  if (dow !== w.day_of_week) return false;
  const partsStart = getZonedParts(t, w.timezone);
  const { h: ws, m: wm } = parseTimeToMinutes(w.start_local_time);
  const { h: we, m: wem } = parseTimeToMinutes(w.end_local_time);
  const wStartMin = ws * 60 + wm;
  const wEndMin = we * 60 + wem;
  const startMin = partsStart.hour * 60 + partsStart.minute;
  const endMin = startMin + durationMinutes;
  if (startMin < wStartMin || endMin > wEndMin) return false;
  const endT = t + durationMs;
  const partsEnd = getZonedParts(endT - 1, w.timezone);
  return (
    partsStart.y === partsEnd.y &&
    partsStart.mo === partsEnd.mo &&
    partsStart.day === partsEnd.day
  );
}

function fitsSomeWindow(
  t: number,
  durationMs: number,
  windows: UserAvailabilityWindowRow[],
): boolean {
  for (const w of windows) {
    if (sessionFitsInWindow(t, durationMs, w)) return true;
  }
  return false;
}

function overlapsBusy(
  t: number,
  end: number,
  busy: { start: number; end: number }[],
): boolean {
  for (const b of busy) {
    if (t < b.end && end > b.start) return true;
  }
  return false;
}

function findNextSlot(
  cursorMs: number,
  durationMs: number,
  windows: UserAvailabilityWindowRow[],
  busy: { start: number; end: number }[],
): number | null {
  const limit = cursorMs + MAX_SEARCH_MS;
  for (let t = cursorMs; t < limit; t += STEP_MS) {
    if (!fitsSomeWindow(t, durationMs, windows)) continue;
    if (overlapsBusy(t, t + durationMs, busy)) continue;
    return t;
  }
  return null;
}

async function loadBusyIntervals(
  supabase: SupabaseClient,
  ownerId: string,
  excludeModuleId: string,
): Promise<{ start: number; end: number }[]> {
  const { data: programs, error: pe } = await supabase
    .from("learning_programs")
    .select("id")
    .eq("owner_id", ownerId);
  if (pe || !programs?.length) return [];

  const programIds = programs.map((p) => p.id);
  const { data: modules, error: me } = await supabase
    .from("learning_modules")
    .select("id")
    .in("learning_program_id", programIds);
  if (me || !modules?.length) return [];

  const moduleIds = modules.map((m) => m.id);
  const { data: rows, error: se } = await supabase
    .from("learning_sessions")
    .select("scheduled_start_at, scheduled_end_at, learning_module_id")
    .in("learning_module_id", moduleIds)
    .not("scheduled_start_at", "is", null)
    .not("scheduled_end_at", "is", null);

  if (se || !rows) return [];

  const out: { start: number; end: number }[] = [];
  for (const r of rows) {
    if (r.learning_module_id === excludeModuleId) continue;
    const a = Date.parse(String(r.scheduled_start_at));
    const b = Date.parse(String(r.scheduled_end_at));
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    out.push({ start: a, end: b });
  }
  out.sort((x, y) => x.start - y.start);
  return out;
}

/**
 * Fills `scheduled_start_at` / `scheduled_end_at` for sessions in the module that are
 * still unscheduled, in `sort_order`, without overlapping other scheduled sessions for
 * the same user.
 */
export async function scheduleUnscheduledSessionsForModule(
  supabase: SupabaseClient,
  options: { moduleId: string; ownerId: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { moduleId, ownerId } = options;

  const { data: windows, error: we } = await supabase
    .from("user_availability_windows")
    .select("*")
    .eq("owner_id", ownerId)
    .order("day_of_week", { ascending: true });

  if (we) return { ok: false, message: we.message };
  if (!windows?.length) {
    return {
      ok: false,
      message:
        "Add at least one working-hours window in Settings → Availability before starting a module.",
    };
  }

  const anchorTz = windows[0]?.timezone ?? "UTC";

  const { data: sessions, error: se } = await supabase
    .from("learning_sessions")
    .select(
      "id, sort_order, planned_start_date, estimated_duration_minutes, scheduled_start_at",
    )
    .eq("learning_module_id", moduleId)
    .order("sort_order", { ascending: true });

  if (se || !sessions?.length) {
    return { ok: false, message: se?.message ?? "Could not load sessions." };
  }

  const toSchedule = sessions.filter((s) => s.scheduled_start_at == null);
  if (toSchedule.length === 0) return { ok: true };

  let minPlanned = toSchedule[0]!.planned_start_date;
  for (const s of toSchedule) {
    if (s.planned_start_date < minPlanned) minPlanned = s.planned_start_date;
  }

  const dayStart = localWallTimeToUtc(minPlanned, 0, 0, anchorTz);
  const now = Date.now();
  let cursor = Math.max(now, dayStart);

  let busy = await loadBusyIntervals(supabase, ownerId, moduleId);

  const nowIso = new Date().toISOString();

  for (const s of toSchedule) {
    const durMin =
      s.estimated_duration_minutes != null && s.estimated_duration_minutes > 0
        ? s.estimated_duration_minutes
        : DEFAULT_DURATION_MIN;
    const durationMs = durMin * 60 * 1000;

    const slot = findNextSlot(cursor, durationMs, windows, busy);
    if (slot === null) {
      return {
        ok: false,
        message:
          "Could not find free slots in your working hours for all sessions. Add availability or shorten sessions.",
      };
    }

    const startIso = new Date(slot).toISOString();
    const endIso = new Date(slot + durationMs).toISOString();

    const { error: ue } = await supabase
      .from("learning_sessions")
      .update({
        scheduled_start_at: startIso,
        scheduled_end_at: endIso,
        updated_at: nowIso,
      })
      .eq("id", s.id);

    if (ue) return { ok: false, message: ue.message };

    busy.push({ start: slot, end: slot + durationMs });
    busy.sort((a, b) => a.start - b.start);
    cursor = slot + durationMs;
  }

  return { ok: true };
}
