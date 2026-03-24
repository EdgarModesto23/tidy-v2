import { browser } from "$app/environment";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import {
  getCachedProgramBundle,
  setCachedProgramBundle,
} from "$lib/cache/learningDataCache";
import type { ProgramDetailPayload } from "$lib/learning/programBundle";
import { isUuid } from "$lib/learning/uuid";

export const load: PageLoad = async ({ fetch, params, parent, depends }) => {
  if (!isUuid(params.programId)) error(404, "Not found");

  depends(`app:learning:program:${params.programId}`);
  depends("app:learning:list");

  const { userId } = await parent();
  if (!userId) error(401, "Unauthorized");

  const todayIso = new Date().toISOString().slice(0, 10);

  if (browser) {
    const cached = getCachedProgramBundle(userId, params.programId);
    if (cached) {
      return {
        program: cached.program,
        modules: cached.modules,
        weaknesses: cached.weaknesses,
        sessionsByModule: cached.sessionsByModule,
        flashcards: cached.flashcards,
        resources: cached.resources,
        loadError: cached.loadError,
        bundle_version: cached.bundle_version,
        todayIso,
      };
    }
  }

  const res = await fetch(`/api/learning/programs/${params.programId}/bundle`);
  if (res.status === 404) error(404, "Not found");
  if (res.status === 401) error(401, "Unauthorized");

  const body = (await res.json()) as ProgramDetailPayload;

  if (!res.ok) {
    return {
      program: null,
      modules: [],
      weaknesses: [],
      sessionsByModule: {},
      flashcards: [],
      resources: [],
      loadError: "Failed to load program.",
      bundle_version: 0,
      todayIso,
    };
  }

  if (!body.program) {
    return {
      program: null,
      modules: [],
      weaknesses: [],
      sessionsByModule: {},
      flashcards: [],
      resources: [],
      loadError: body.loadError ?? "Program could not be loaded.",
      bundle_version: body.bundle_version ?? 0,
      todayIso,
    };
  }

  const payload: ProgramDetailPayload = {
    program: body.program,
    modules: body.modules,
    weaknesses: body.weaknesses,
    sessionsByModule: body.sessionsByModule,
    flashcards: body.flashcards,
    resources: body.resources,
    loadError: body.loadError,
    bundle_version: body.bundle_version,
  };

  if (browser) {
    setCachedProgramBundle(userId, params.programId, payload);
  }

  return {
    ...payload,
    todayIso,
  };
};
