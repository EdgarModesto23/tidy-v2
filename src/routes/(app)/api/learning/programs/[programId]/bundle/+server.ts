import { error, json } from "@sveltejs/kit";
import { parseProgramBundleRpc } from "$lib/learning/programBundle";
import { isUuid } from "$lib/learning/uuid";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!isUuid(params.programId)) error(404, "Not found");

  const { user } = await locals.safeGetSession();
  if (!user) error(401, "Unauthorized");

  const { data: raw, error: rpcError } = await locals.supabase.rpc(
    "get_learning_program_bundle",
    { p_program_id: params.programId },
  );

  if (rpcError) {
    return json(
      {
        program: null,
        modules: [],
        weaknesses: [],
        sessionsByModule: {},
        flashcards: [],
        resources: [],
        loadError: rpcError.message,
        bundle_version: 0,
      },
      { status: 200 },
    );
  }

  const parsed = parseProgramBundleRpc(raw, "Invalid response.");
  if (!parsed.ok) {
    if (parsed.error === "not_found") error(404, "Not found");
    if (parsed.error === "unauthorized") error(401, "Unauthorized");
    return json({
      program: null,
      modules: [],
      weaknesses: [],
      sessionsByModule: {},
      flashcards: [],
      resources: [],
      loadError: parsed.error,
      bundle_version: 0,
    });
  }

  const d = parsed.data;
  if (!d.program) error(404, "Not found");

  return json({
    program: d.program,
    modules: d.modules,
    weaknesses: d.weaknesses,
    sessionsByModule: d.sessionsByModule,
    flashcards: d.flashcards,
    resources: d.resources,
    loadError: d.loadError,
    bundle_version: d.bundle_version,
  });
};
