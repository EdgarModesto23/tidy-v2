import { fail } from "@sveltejs/kit";
import { UUID_RE } from "$lib/learning/uuid";
import type { Actions, PageServerLoad } from "./$types";

function timeToSec(t: string): number {
  const parts = t.split(":").map((x) => Number(x));
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  return h * 3600 + m * 60 + s;
}

function normalizeTimeInput(t: string): string {
  const trimmed = t.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

export const load: PageServerLoad = async ({ locals, depends }) => {
  depends("app:learning:availability");
  const { user } = await locals.safeGetSession();
  if (!user) return { windows: [], defaultTz: "UTC", loadError: "Unauthorized." };

  const { data, error } = await locals.supabase
    .from("user_availability_windows")
    .select("*")
    .eq("owner_id", user.id)
    .order("day_of_week", { ascending: true })
    .order("start_local_time", { ascending: true });

  if (error) {
    return { windows: [], defaultTz: "UTC", loadError: error.message };
  }

  const defaultTz = data?.[0]?.timezone ?? "UTC";
  return { windows: data ?? [], defaultTz, loadError: null };
};

export const actions: Actions = {
  createWindow: async ({ request, locals }) => {
    const { user } = await locals.safeGetSession();
    if (!user) return fail(401, { message: "Sign in required." });

    const fd = await request.formData();
    const dayRaw = fd.get("day_of_week");
    const day = Number(dayRaw);
    const start = normalizeTimeInput(String(fd.get("start_local_time") ?? ""));
    const end = normalizeTimeInput(String(fd.get("end_local_time") ?? ""));
    const timezone = String(fd.get("timezone") ?? "").trim();

    if (!timezone) return fail(400, { message: "Timezone is required." });
    if (!Number.isFinite(day) || day < 0 || day > 6 || !Number.isInteger(day)) {
      return fail(400, { message: "Day of week must be 0–6 (Sun–Sat)." });
    }
    if (!start || !end) return fail(400, { message: "Start and end times are required." });
    if (timeToSec(end) <= timeToSec(start)) {
      return fail(400, { message: "End time must be after start (same-day windows only)." });
    }

    const { error } = await locals.supabase.from("user_availability_windows").insert({
      owner_id: user.id,
      day_of_week: day,
      start_local_time: start,
      end_local_time: end,
      timezone,
    });

    if (error) return fail(400, { message: error.message });
    return { success: true as const, message: "Availability window added." };
  },

  createWindowsBulk: async ({ request, locals }) => {
    const { user } = await locals.safeGetSession();
    if (!user) return fail(401, { message: "Sign in required." });

    const fd = await request.formData();
    const rawDays = fd.getAll("days");
    const days = [
      ...new Set(
        rawDays
          .map((x) => Number(x))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      ),
    ].sort((a, b) => a - b);

    const start = normalizeTimeInput(String(fd.get("start_local_time") ?? ""));
    const end = normalizeTimeInput(String(fd.get("end_local_time") ?? ""));
    const timezone = String(fd.get("timezone") ?? "").trim();

    if (!timezone) return fail(400, { message: "Timezone is required." });
    if (days.length === 0) {
      return fail(400, { message: "Select at least one weekday." });
    }
    if (!start || !end) return fail(400, { message: "Start and end times are required." });
    if (timeToSec(end) <= timeToSec(start)) {
      return fail(400, { message: "End time must be after start (same-day windows only)." });
    }

    const { data: existing, error: exErr } = await locals.supabase
      .from("user_availability_windows")
      .select("day_of_week, start_local_time, end_local_time, timezone")
      .eq("owner_id", user.id);

    if (exErr) return fail(400, { message: exErr.message });

    function rowKey(
      d: number,
      s: string,
      e: string,
      tz: string,
    ): string {
      return `${d}|${normalizeTimeInput(s)}|${normalizeTimeInput(e)}|${tz}`;
    }

    const existingKeys = new Set(
      (existing ?? []).map((r) =>
        rowKey(
          r.day_of_week,
          String(r.start_local_time),
          String(r.end_local_time),
          r.timezone,
        ),
      ),
    );

    const toInsert = days.filter(
      (d) => !existingKeys.has(rowKey(d, start, end, timezone)),
    );

    if (toInsert.length === 0) {
      return {
        success: true as const,
        message:
          "No new windows added — these days already have this exact time range and timezone.",
      };
    }

    const rows = toInsert.map((day_of_week) => ({
      owner_id: user.id,
      day_of_week,
      start_local_time: start,
      end_local_time: end,
      timezone,
    }));

    const { error } = await locals.supabase.from("user_availability_windows").insert(rows);

    if (error) return fail(400, { message: error.message });

    const skipped = days.length - toInsert.length;
    const msg =
      skipped > 0
        ? `Added ${toInsert.length} window${toInsert.length === 1 ? "" : "s"}. Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"} already on file.`
        : `Added ${toInsert.length} window${toInsert.length === 1 ? "" : "s"}.`;

    return { success: true as const, message: msg };
  },

  updateWindow: async ({ request, locals }) => {
    const { user } = await locals.safeGetSession();
    if (!user) return fail(401, { message: "Sign in required." });

    const fd = await request.formData();
    const id = String(fd.get("id") ?? "");
    if (!UUID_RE.test(id)) return fail(400, { message: "Invalid window." });

    const dayRaw = fd.get("day_of_week");
    const day = Number(dayRaw);
    const start = normalizeTimeInput(String(fd.get("start_local_time") ?? ""));
    const end = normalizeTimeInput(String(fd.get("end_local_time") ?? ""));
    const timezone = String(fd.get("timezone") ?? "").trim();

    if (!timezone) return fail(400, { message: "Timezone is required." });
    if (!Number.isFinite(day) || day < 0 || day > 6 || !Number.isInteger(day)) {
      return fail(400, { message: "Day of week must be 0–6 (Sun–Sat)." });
    }
    if (!start || !end) return fail(400, { message: "Start and end times are required." });
    if (timeToSec(end) <= timeToSec(start)) {
      return fail(400, { message: "End time must be after start." });
    }

    const { error } = await locals.supabase
      .from("user_availability_windows")
      .update({
        day_of_week: day,
        start_local_time: start,
        end_local_time: end,
        timezone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_id", user.id);

    if (error) return fail(400, { message: error.message });
    return { success: true as const, message: "Window updated." };
  },

  deleteWindow: async ({ request, locals }) => {
    const { user } = await locals.safeGetSession();
    if (!user) return fail(401, { message: "Sign in required." });

    const fd = await request.formData();
    const id = String(fd.get("id") ?? "");
    if (!UUID_RE.test(id)) return fail(400, { message: "Invalid window." });

    const { error } = await locals.supabase
      .from("user_availability_windows")
      .delete()
      .eq("id", id)
      .eq("owner_id", user.id);

    if (error) return fail(400, { message: error.message });
    return { success: true as const, message: "Window removed." };
  },
};
