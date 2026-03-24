import { fail } from "@sveltejs/kit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_RE } from "$lib/learning/uuid";
import type { Actions } from "./$types";

async function assertProgramOwner(
  supabase: SupabaseClient,
  userId: string,
  programId: string,
) {
  const { data, error: e } = await supabase
    .from("learning_programs")
    .select("id")
    .eq("id", programId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (e || !data) return null;
  return data;
}

async function moduleInProgram(
  supabase: SupabaseClient,
  moduleId: string,
  programId: string,
) {
  const { data } = await supabase
    .from("learning_modules")
    .select("id")
    .eq("id", moduleId)
    .eq("learning_program_id", programId)
    .maybeSingle();
  return !!data;
}

export const actions: Actions = {
  deleteModule: async ({ request, locals, params }) => {
    if (!UUID_RE.test(params.programId))
      return fail(400, { message: "Invalid program." });
    const { user } = await locals.safeGetSession();
    if (!user) return fail(401, { message: "Sign in required." });
    const row = await assertProgramOwner(
      locals.supabase,
      user.id,
      params.programId,
    );
    if (!row) return fail(404, { message: "Program not found." });

    const fd = await request.formData();
    const moduleId = String(fd.get("module_id") ?? "");
    if (!UUID_RE.test(moduleId)) return fail(400, { message: "Invalid module." });
    const ok = await moduleInProgram(
      locals.supabase,
      moduleId,
      params.programId,
    );
    if (!ok) return fail(404, { message: "Module not found." });

    const { error: e } = await locals.supabase
      .from("learning_modules")
      .delete()
      .eq("id", moduleId);
    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Module removed." };
  },

  toggleModuleComplete: async ({ request, locals, params }) => {
    if (!UUID_RE.test(params.programId))
      return fail(400, { message: "Invalid program." });
    const { user } = await locals.safeGetSession();
    if (!user) return fail(401, { message: "Sign in required." });
    const row = await assertProgramOwner(
      locals.supabase,
      user.id,
      params.programId,
    );
    if (!row) return fail(404, { message: "Program not found." });

    const fd = await request.formData();
    const moduleId = String(fd.get("module_id") ?? "");
    if (!UUID_RE.test(moduleId)) return fail(400, { message: "Invalid module." });
    const ok = await moduleInProgram(
      locals.supabase,
      moduleId,
      params.programId,
    );
    if (!ok) return fail(404, { message: "Module not found." });

    const { data: mod, error: readErr } = await locals.supabase
      .from("learning_modules")
      .select("completed_at")
      .eq("id", moduleId)
      .maybeSingle();

    if (readErr) return fail(400, { message: readErr.message });

    const nextCompleted = mod?.completed_at ? null : new Date().toISOString();
    const { error: e } = await locals.supabase
      .from("learning_modules")
      .update({
        completed_at: nextCompleted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", moduleId);

    if (e) return fail(400, { message: e.message });
    return {
      success: true as const,
      message: nextCompleted ? "Module marked done." : "Module reopened.",
    };
  },
};
