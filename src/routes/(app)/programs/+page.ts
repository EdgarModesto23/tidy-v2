import { browser } from "$app/environment";
import type { PageLoad } from "./$types";
import {
  getCachedProgramList,
  setCachedProgramList,
  type ProgramListPayload,
} from "$lib/cache/learningDataCache";

export const load: PageLoad = async ({ fetch, parent, depends }) => {
  depends("app:learning:list");

  const { userId } = await parent();
  if (!userId) {
    const empty: ProgramListPayload = {
      programs: [],
      loadError: null,
      list_version: 0,
    };
    return empty;
  }

  if (browser) {
    const cached = getCachedProgramList(userId);
    if (cached) return cached;
  }

  const res = await fetch("/api/learning/programs");
  if (!res.ok) {
    return {
      programs: [],
      loadError:
        res.status === 401
          ? "Unauthorized."
          : "Could not load programs.",
      list_version: 0,
    } satisfies ProgramListPayload;
  }

  const body = (await res.json()) as ProgramListPayload;
  if (browser) {
    setCachedProgramList(userId, body);
  }
  return body;
};
