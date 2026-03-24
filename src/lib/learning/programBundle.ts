import type {
  LearningModuleRow,
  LearningProgramRow,
  LearningSessionRow,
  MetalearningResourceRow,
  ProgramFlashcardRow,
  ProgramWeaknessRow,
} from "$lib/learning/types";

export type ProgramDetailPayload = {
  program: LearningProgramRow | null;
  modules: LearningModuleRow[];
  weaknesses: ProgramWeaknessRow[];
  sessionsByModule: Record<string, LearningSessionRow[]>;
  flashcards: ProgramFlashcardRow[];
  resources: MetalearningResourceRow[];
  loadError: string | null;
  bundle_version: number;
};

type RpcFail = { ok: false; error: string };

type RpcOk = {
  ok: true;
  bundle_version: number;
  program: LearningProgramRow;
  modules: LearningModuleRow[];
  sessions: LearningSessionRow[];
  weaknesses: ProgramWeaknessRow[];
  flashcards: ProgramFlashcardRow[];
  resources: MetalearningResourceRow[];
};

export function buildSessionsByModule(
  modules: LearningModuleRow[],
  sessions: LearningSessionRow[],
): Record<string, LearningSessionRow[]> {
  const sessionsByModule: Record<string, LearningSessionRow[]> = {};
  for (const m of modules) sessionsByModule[m.id] = [];
  for (const row of sessions) {
    const list = sessionsByModule[row.learning_module_id];
    if (list) list.push(row);
  }
  return sessionsByModule;
}

/** Parses JSON returned by `get_learning_program_bundle` RPC. */
export function parseProgramBundleRpc(
  raw: unknown,
  loadErrorFallback: string,
): { ok: true; data: ProgramDetailPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: loadErrorFallback };
  }
  const o = raw as RpcFail | RpcOk;
  if (!("ok" in o)) {
    return { ok: false, error: loadErrorFallback };
  }
  if (!o.ok) {
    return { ok: false, error: "error" in o ? String(o.error) : loadErrorFallback };
  }

  const program = o.program;
  const modules = Array.isArray(o.modules) ? o.modules : [];
  const sessions = Array.isArray(o.sessions) ? o.sessions : [];

  const bv = o.bundle_version;
  const bundle_version =
    typeof bv === "number"
      ? bv
      : typeof bv === "string"
        ? Number(bv) || 0
        : 0;

  return {
    ok: true,
    data: {
      program,
      modules,
      weaknesses: Array.isArray(o.weaknesses) ? o.weaknesses : [],
      sessionsByModule: buildSessionsByModule(modules, sessions),
      flashcards: Array.isArray(o.flashcards) ? o.flashcards : [],
      resources: Array.isArray(o.resources) ? o.resources : [],
      loadError: null,
      bundle_version,
    },
  };
}
