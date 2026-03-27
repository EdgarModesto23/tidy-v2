import { fail } from "@sveltejs/kit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleUnscheduledSessionsForModule } from "$lib/learning/scheduling";
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
  startModule: async ({ request, locals, params }) => {
    if (!UUID_RE.test(params.programId))
      return fail(400, { message: "Invalid program." });
    const { user } = await locals.safeGetSession();
    if (!user) return fail(401, { message: "Sign in required." });
    const row = await assertProgramOwner(locals.supabase, user.id, params.programId);
    if (!row) return fail(404, { message: "Program not found." });

    const fd = await request.formData();
    const moduleId = String(fd.get("module_id") ?? "");
    if (!UUID_RE.test(moduleId)) return fail(400, { message: "Invalid module." });
    const ok = await moduleInProgram(locals.supabase, moduleId, params.programId);
    if (!ok) return fail(404, { message: "Module not found." });

    const { data: mod, error: readErr } = await locals.supabase
      .from("learning_modules")
      .select("module_state, completed_at, started_at")
      .eq("id", moduleId)
      .maybeSingle();
    if (readErr) return fail(400, { message: readErr.message });
    if (!mod) return fail(404, { message: "Module not found." });
    if (mod.completed_at) return fail(400, { message: "Cannot start a completed module." });
    if (mod.module_state === "started" || mod.started_at) {
      return fail(400, { message: "This module is already started." });
    }

    const nowIso = new Date().toISOString();
    const { error: upErr } = await locals.supabase
      .from("learning_modules")
      .update({
        module_state: "started",
        started_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", moduleId)
      .eq("learning_program_id", params.programId);
    if (upErr) return fail(400, { message: upErr.message });

    const sched = await scheduleUnscheduledSessionsForModule(locals.supabase, {
      moduleId,
      ownerId: user.id,
    });
    if (!sched.ok) {
      await locals.supabase
        .from("learning_modules")
        .update({
          module_state: "pending",
          started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", moduleId);
      return fail(400, { message: sched.message });
    }

    return {
      success: true as const,
      message: "Module started and unscheduled sessions were placed in your calendar.",
    };
  },

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
      .select("completed_at, started_at")
      .eq("id", moduleId)
      .maybeSingle();

    if (readErr) return fail(400, { message: readErr.message });

    const nextCompleted = mod?.completed_at ? null : new Date().toISOString();
    const nextState = nextCompleted
      ? "completed"
      : mod?.started_at
        ? "started"
        : "pending";
    const { error: e } = await locals.supabase
      .from("learning_modules")
      .update({
        completed_at: nextCompleted,
        module_state: nextState,
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
