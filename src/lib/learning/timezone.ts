/** IANA timezone wall-clock helpers using Intl (no extra deps). */

/** Today's calendar date (YYYY-MM-DD) in `timeZone` (for server-side "today"). */
export function todayIsoInTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type ZonedParts = {
  y: number;
  mo: number;
  day: number;
  hour: number;
  minute: number;
};

export function getZonedParts(utcMs: number, timeZone: string): ZonedParts {
  const d = new Date(utcMs);
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = f.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPart["type"]) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    y: get("year"),
    mo: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function compareLocalDateTime(
  p: ZonedParts,
  y: number,
  mo: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const a =
    p.y * 100_000_000 +
    p.mo * 1_000_000 +
    p.day * 10_000 +
    p.hour * 100 +
    p.minute;
  const b = y * 100_000_000 + mo * 1_000_000 + day * 10_000 + hour * 100 + minute;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * UTC instant for a local wall time on a calendar date in `timeZone`
 * (e.g. 2025-03-15 09:30 in America/Sao_Paulo).
 */
export function localWallTimeToUtc(
  isoDate: string,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const anchor = Date.UTC(y, mo - 1, d, 12, 0, 0);
  let lo = anchor - 16 * 3600 * 1000;
  let hi = anchor + 16 * 3600 * 1000;
  for (let i = 0; i < 56; i++) {
    const mid = (lo + hi) / 2;
    const p = getZonedParts(mid, timeZone);
    const cmp = compareLocalDateTime(p, y, mo, d, hour, minute);
    if (cmp === 0) return Math.round(mid);
    if (cmp < 0) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

export function weekdaySun0(utcMs: number, timeZone: string): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date(utcMs));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

export function dayStartUtc(isoDate: string, timeZone: string): number {
  return localWallTimeToUtc(isoDate, 0, 0, timeZone);
}

/** `[rangeStart, rangeEnd)` in UTC ISO strings for a calendar month in `timeZone`. */
export function monthRangeUtcIso(
  year: number,
  monthIndex0: number,
  timeZone: string,
): { rangeStart: string; rangeEnd: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = `${year}-${pad(monthIndex0 + 1)}-01`;
  const startMs = dayStartUtc(first, timeZone);
  const nextMonth = monthIndex0 === 11 ? 0 : monthIndex0 + 1;
  const nextYear = monthIndex0 === 11 ? year + 1 : year;
  const nextFirst = `${nextYear}-${pad(nextMonth + 1)}-01`;
  const endMs = dayStartUtc(nextFirst, timeZone);
  return {
    rangeStart: new Date(startMs).toISOString(),
    rangeEnd: new Date(endMs).toISOString(),
  };
}

/** `[rangeStart, rangeEnd)` for one local calendar day in `timeZone`. */
export function dayRangeUtcIso(isoDate: string, timeZone: string): {
  rangeStart: string;
  rangeEnd: string;
} {
  const startMs = dayStartUtc(isoDate, timeZone);
  const [y, mo, d] = isoDate.split("-").map(Number);
  const nextUtc = new Date(Date.UTC(y, mo - 1, d + 1));
  const nextIso = nextUtc.toISOString().slice(0, 10);
  const endMs = dayStartUtc(nextIso, timeZone);
  return {
    rangeStart: new Date(startMs).toISOString(),
    rangeEnd: new Date(endMs).toISOString(),
  };
}
