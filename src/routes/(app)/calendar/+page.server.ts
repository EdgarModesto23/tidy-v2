import { parseUserSessionsInRangeRpc } from "$lib/learning/calendar";
import { monthRangeUtcIso } from "$lib/learning/timezone";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url, depends }) => {
  depends("app:learning:calendar");
  const { user } = await locals.safeGetSession();
  if (!user) {
    return {
      sessions: [],
      monthLabel: "",
      monthParam: "",
      tz: "UTC",
      rangeError: null,
    };
  }

  const { data: win } = await locals.supabase
    .from("user_availability_windows")
    .select("timezone")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();

  const tz = win?.timezone ?? "UTC";

  const m = url.searchParams.get("month");
  const now = new Date();
  let y = now.getFullYear();
  let mo = now.getMonth();
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [yy, mm] = m.split("-").map(Number);
    if (Number.isFinite(yy) && Number.isFinite(mm) && mm >= 1 && mm <= 12) {
      y = yy;
      mo = mm - 1;
    }
  }

  const { rangeStart, rangeEnd } = monthRangeUtcIso(y, mo, tz);

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
      monthLabel: `${y}-${String(mo + 1).padStart(2, "0")}`,
      monthParam: `${y}-${String(mo + 1).padStart(2, "0")}`,
      tz,
      rangeError: re.message,
    };
  }

  const parsed = parseUserSessionsInRangeRpc(raw);
  const sessions = parsed.ok ? parsed.sessions : [];

  const monthParam = `${y}-${String(mo + 1).padStart(2, "0")}`;
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, mo, 1)));

  return {
    sessions,
    monthLabel,
    monthParam,
    tz,
    rangeError: parsed.ok ? null : parsed.error,
  };
};
