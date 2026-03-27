import { parseUserSessionsInRangeRpc } from "$lib/learning/calendar";
import { dayRangeUtcIso, todayIsoInTimeZone } from "$lib/learning/timezone";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url, depends }) => {
  depends("app:learning:calendar");
  const { user } = await locals.safeGetSession();
  if (!user) {
    return { sessions: [], dayIso: "", tz: "UTC", rangeError: null };
  }

  const { data: win } = await locals.supabase
    .from("user_availability_windows")
    .select("timezone")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();

  const tz = win?.timezone ?? "UTC";

  const q = url.searchParams.get("day");
  let dayIso = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayIsoInTimeZone(tz);

  const { rangeStart, rangeEnd } = dayRangeUtcIso(dayIso, tz);

  const { data: raw, error: re } = await locals.supabase.rpc(
    "get_user_sessions_in_range",
    {
      range_start: rangeStart,
      range_end: rangeEnd,
    },
  );

  if (re) {
    return {
      sessions: [],
      dayIso,
      tz,
      rangeError: re.message,
    };
  }

  const parsed = parseUserSessionsInRangeRpc(raw);
  const sessions = parsed.ok ? parsed.sessions : [];

  return {
    sessions,
    dayIso,
    tz,
    rangeError: parsed.ok ? null : parsed.error,
  };
};
