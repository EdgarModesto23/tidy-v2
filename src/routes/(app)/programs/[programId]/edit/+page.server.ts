import { fail, redirect } from "@sveltejs/kit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMockLearningPlan } from "$lib/learning/mock-ai";
import { UUID_RE } from "$lib/learning/uuid";
import { applyRoadmapBatch } from "$lib/learning/roadmapBatchApply";
import type { RoadmapSnapshotPayload } from "$lib/learning/roadmapDraft";
import type {
  LearningProgramReason,
  LearningSessionType,
  MetalearningResourceKind,
} from "$lib/learning/types";
import type { Actions } from "./$types";

function utcTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseReason(v: FormDataEntryValue | null): LearningProgramReason | null {
  if (v === "instrumental" || v === "intrinsic") return v;
  return null;
}

function parseSessionType(v: FormDataEntryValue | null): LearningSessionType | null {
  const s = String(v ?? "");
  if (
    s === "test" ||
    s === "study" ||
    s === "drill" ||
    s === "project" ||
    s === "flashcard_session"
  ) {
    return s;
  }
  return null;
}

function parseResourceKind(v: FormDataEntryValue | null): MetalearningResourceKind | null {
  const s = String(v ?? "");
  if (s === "document" || s === "link" || s === "picture") return s;
  return null;
}

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

async function getRootModuleId(
  supabase: SupabaseClient,
  programId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("learning_modules")
    .select("id")
    .eq("learning_program_id", programId)
    .is("parent_module_id", null)
    .maybeSingle();
  return data?.id ?? null;
}

export const actions: Actions = {
  updateProgram: async ({ request, locals, params }) => {
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
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return fail(400, { message: "Name is required." });
    const reason = parseReason(fd.get("reason"));
    if (!reason) return fail(400, { message: "Choose a learning reason." });

    const { error: e } = await locals.supabase
      .from("learning_programs")
      .update({
        name,
        description: String(fd.get("description") ?? "").trim() || null,
        starting_point_description:
          String(fd.get("starting_point_description") ?? "").trim() || null,
        reason,
        reason_description:
          String(fd.get("reason_description") ?? "").trim() || null,
        target_start_date:
          String(fd.get("target_start_date") ?? "").trim() || null,
        target_end_date:
          String(fd.get("target_end_date") ?? "").trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.programId);

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Program saved." };
  },

  deleteProgram: async ({ locals, params }) => {
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

    const { error: e } = await locals.supabase
      .from("learning_programs")
      .delete()
      .eq("id", params.programId);
    if (e) return fail(400, { message: e.message });
    redirect(303, "/programs");
  },

  addModule: async ({ request, locals, params }) => {
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
    const title = String(fd.get("title") ?? "").trim();
    if (!title) return fail(400, { message: "Module title is required." });

    const { count, error: countErr } = await locals.supabase
      .from("learning_modules")
      .select("*", { count: "exact", head: true })
      .eq("learning_program_id", params.programId);

    if (countErr) return fail(400, { message: countErr.message });

    const parentRaw = String(fd.get("parent_module_id") ?? "").trim();
    let parent_module_id: string | null = null;

    if ((count ?? 0) === 0) {
      parent_module_id = null;
    } else {
      if (UUID_RE.test(parentRaw)) {
        const ok = await moduleInProgram(
          locals.supabase,
          parentRaw,
          params.programId,
        );
        if (ok) parent_module_id = parentRaw;
      }
      if (parent_module_id === null) {
        const rootId = await getRootModuleId(
          locals.supabase,
          params.programId,
        );
        if (!rootId) {
          return fail(400, {
            message: "Program has no root module; contact support or run DB migration.",
          });
        }
        parent_module_id = rootId;
      }
    }

    const { data: last } = await locals.supabase
      .from("learning_modules")
      .select("sort_order")
      .eq("learning_program_id", params.programId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sort_order = (last?.sort_order ?? -1) + 1;

    const { error: e } = await locals.supabase.from("learning_modules").insert({
      learning_program_id: params.programId,
      parent_module_id,
      title,
      description: String(fd.get("description") ?? "").trim() || null,
      sort_order,
    });

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Module added." };
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

  addSession: async ({ request, locals, params }) => {
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

    const name = String(fd.get("name") ?? "").trim();
    if (!name) return fail(400, { message: "Session name is required." });
    const session_type = parseSessionType(fd.get("session_type"));
    if (!session_type) return fail(400, { message: "Session type is invalid." });

    const planned_start_date = String(
      fd.get("planned_start_date") ?? "",
    ).trim();
    const planned_end_date = String(fd.get("planned_end_date") ?? "").trim();
    if (!planned_start_date || !planned_end_date) {
      return fail(400, { message: "Planned dates are required." });
    }

    const { data: last } = await locals.supabase
      .from("learning_sessions")
      .select("sort_order")
      .eq("learning_module_id", moduleId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sort_order = (last?.sort_order ?? -1) + 1;

    const estRaw = String(fd.get("estimated_duration_minutes") ?? "").trim();
    const estimated_duration_minutes = estRaw
      ? Math.max(1, parseInt(estRaw, 10) || 0)
      : null;

    const { error: e } = await locals.supabase
      .from("learning_sessions")
      .insert({
        learning_module_id: moduleId,
        name,
        session_type,
        sort_order,
        planned_start_date,
        planned_end_date,
        status: "planned",
        estimated_duration_minutes,
        notes: String(fd.get("notes") ?? "").trim() || null,
      });

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Session scheduled." };
  },

  deleteSession: async ({ request, locals, params }) => {
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
    const sessionId = String(fd.get("session_id") ?? "");
    if (!UUID_RE.test(sessionId)) return fail(400, { message: "Invalid session." });

    const { data: sess } = await locals.supabase
      .from("learning_sessions")
      .select("id, learning_module_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (!sess) return fail(404, { message: "Session not found." });
    const inProg = await moduleInProgram(
      locals.supabase,
      sess.learning_module_id,
      params.programId,
    );
    if (!inProg) return fail(404, { message: "Session not found." });

    const { error: e } = await locals.supabase
      .from("learning_sessions")
      .delete()
      .eq("id", sessionId);
    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Session removed." };
  },

  toggleSessionComplete: async ({ request, locals, params }) => {
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
    const sessionId = String(fd.get("session_id") ?? "");
    if (!UUID_RE.test(sessionId)) return fail(400, { message: "Invalid session." });

    const { data: sess, error: se } = await locals.supabase
      .from("learning_sessions")
      .select("id, learning_module_id, status")
      .eq("id", sessionId)
      .maybeSingle();

    if (se || !sess) return fail(404, { message: "Session not found." });
    const inProg = await moduleInProgram(
      locals.supabase,
      sess.learning_module_id,
      params.programId,
    );
    if (!inProg) return fail(404, { message: "Session not found." });

    const now = new Date().toISOString();
    const isDone = sess.status === "completed";

    const patch = isDone
      ? {
          status: "planned" as const,
          actual_completed_at: null as string | null,
          updated_at: now,
        }
      : {
          status: "completed" as const,
          actual_completed_at: now,
          updated_at: now,
        };

    const { error: e } = await locals.supabase
      .from("learning_sessions")
      .update(patch)
      .eq("id", sessionId);

    if (e) return fail(400, { message: e.message });
    return {
      success: true as const,
      message: isDone ? "Session reopened." : "Session marked done.",
    };
  },

  addWeakness: async ({ request, locals, params }) => {
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
    const title = String(fd.get("title") ?? "").trim();
    if (!title) return fail(400, { message: "Weakness title is required." });

    const { data: last } = await locals.supabase
      .from("program_weaknesses")
      .select("sort_order")
      .eq("learning_program_id", params.programId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sort_order = (last?.sort_order ?? -1) + 1;

    const { error: e } = await locals.supabase.from("program_weaknesses").insert({
      learning_program_id: params.programId,
      title,
      description: String(fd.get("description") ?? "").trim() || null,
      priority: Math.min(
        32767,
        Math.max(
          0,
          parseInt(String(fd.get("priority") ?? "0"), 10) || 0,
        ),
      ),
      sort_order,
    });

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Weakness added." };
  },

  updateWeakness: async ({ request, locals, params }) => {
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
    const weaknessId = String(fd.get("weakness_id") ?? "");
    if (!UUID_RE.test(weaknessId))
      return fail(400, { message: "Invalid weakness." });
    const title = String(fd.get("title") ?? "").trim();
    if (!title) return fail(400, { message: "Weakness title is required." });

    const { error: e } = await locals.supabase
      .from("program_weaknesses")
      .update({
        title,
        description: String(fd.get("description") ?? "").trim() || null,
        priority: Math.min(
          32767,
          Math.max(
            0,
            parseInt(String(fd.get("priority") ?? "0"), 10) || 0,
          ),
        ),
      })
      .eq("id", weaknessId)
      .eq("learning_program_id", params.programId);

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Weakness updated." };
  },

  deleteWeakness: async ({ request, locals, params }) => {
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
    const weaknessId = String(fd.get("weakness_id") ?? "");
    if (!UUID_RE.test(weaknessId))
      return fail(400, { message: "Invalid weakness." });

    const { error: e } = await locals.supabase
      .from("program_weaknesses")
      .delete()
      .eq("id", weaknessId)
      .eq("learning_program_id", params.programId);

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Weakness removed." };
  },

  addFlashcard: async ({ request, locals, params }) => {
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
    const front_text = String(fd.get("front_text") ?? "").trim();
    const back_text = String(fd.get("back_text") ?? "").trim();
    if (!front_text || !back_text) {
      return fail(400, { message: "Front and back are required." });
    }

    const { error: e } = await locals.supabase.from("program_flashcards").insert({
      learning_program_id: params.programId,
      front_text,
      back_text,
    });

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Flashcard added." };
  },

  updateFlashcard: async ({ request, locals, params }) => {
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
    const flashcardId = String(fd.get("flashcard_id") ?? "");
    if (!UUID_RE.test(flashcardId))
      return fail(400, { message: "Invalid flashcard." });
    const front_text = String(fd.get("front_text") ?? "").trim();
    const back_text = String(fd.get("back_text") ?? "").trim();
    if (!front_text || !back_text) {
      return fail(400, { message: "Front and back are required." });
    }

    const { error: e } = await locals.supabase
      .from("program_flashcards")
      .update({
        front_text,
        back_text,
      })
      .eq("id", flashcardId)
      .eq("learning_program_id", params.programId);

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Flashcard updated." };
  },

  deleteFlashcard: async ({ request, locals, params }) => {
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
    const id = String(fd.get("flashcard_id") ?? "");
    if (!UUID_RE.test(id)) return fail(400, { message: "Invalid flashcard." });

    const { error: e } = await locals.supabase
      .from("program_flashcards")
      .delete()
      .eq("id", id)
      .eq("learning_program_id", params.programId);

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Flashcard removed." };
  },

  addResource: async ({ request, locals, params }) => {
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
    const kind = parseResourceKind(fd.get("kind"));
    if (!kind) return fail(400, { message: "Resource type is invalid." });
    const title = String(fd.get("title") ?? "").trim();
    const uri = String(fd.get("uri") ?? "").trim();
    if (!title || !uri) return fail(400, { message: "Title and URI are required." });

    const { error: e } = await locals.supabase
      .from("metalearning_resources")
      .insert({
        learning_program_id: params.programId,
        kind,
        title,
        description: String(fd.get("description") ?? "").trim() || null,
        uri,
      });

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Resource added." };
  },

  updateResource: async ({ request, locals, params }) => {
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
    const resourceId = String(fd.get("resource_id") ?? "");
    if (!UUID_RE.test(resourceId))
      return fail(400, { message: "Invalid resource." });
    const kind = parseResourceKind(fd.get("kind"));
    if (!kind) return fail(400, { message: "Resource type is invalid." });
    const title = String(fd.get("title") ?? "").trim();
    const uri = String(fd.get("uri") ?? "").trim();
    if (!title || !uri) return fail(400, { message: "Title and URI are required." });

    const { error: e } = await locals.supabase
      .from("metalearning_resources")
      .update({
        kind,
        title,
        description: String(fd.get("description") ?? "").trim() || null,
        uri,
      })
      .eq("id", resourceId)
      .eq("learning_program_id", params.programId);

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Resource updated." };
  },

  deleteResource: async ({ request, locals, params }) => {
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
    const id = String(fd.get("resource_id") ?? "");
    if (!UUID_RE.test(id)) return fail(400, { message: "Invalid resource." });

    const { error: e } = await locals.supabase
      .from("metalearning_resources")
      .delete()
      .eq("id", id)
      .eq("learning_program_id", params.programId);

    if (e) return fail(400, { message: e.message });
    return { success: true as const, message: "Resource removed." };
  },

  saveRoadmapBatch: async ({ request, locals, params }) => {
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
    const raw = fd.get("payload");
    if (typeof raw !== "string") return fail(400, { message: "Missing payload." });

    let parsed: RoadmapSnapshotPayload;
    try {
      parsed = JSON.parse(raw) as RoadmapSnapshotPayload;
    } catch {
      return fail(400, { message: "Invalid JSON." });
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.modules) ||
      !Array.isArray(parsed.sessions)
    ) {
      return fail(400, { message: "Invalid roadmap payload." });
    }

    const result = await applyRoadmapBatch(
      locals.supabase,
      params.programId,
      parsed,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { success: true as const, message: "Roadmap saved." };
  },

  mockAiGenerate: async ({ request, locals, params }) => {
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
    const brief = String(fd.get("brief") ?? "").trim();
    const replaceRoadmap = fd.get("replace_roadmap") === "on";

    await new Promise((r) => setTimeout(r, 900));

    const supabase = locals.supabase;
    const programId = params.programId;
    const plan = buildMockLearningPlan(brief);

    if (replaceRoadmap) {
      const { error: dm } = await supabase
        .from("learning_modules")
        .delete()
        .eq("learning_program_id", programId);
      if (dm) return fail(400, { message: dm.message });

      const { error: dw } = await supabase
        .from("program_weaknesses")
        .delete()
        .eq("learning_program_id", programId);
      if (dw) return fail(400, { message: dw.message });
    }

    const today = utcTodayIso();
    let moduleSort = 0;
    if (!replaceRoadmap) {
      const { data: lastMod } = await supabase
        .from("learning_modules")
        .select("sort_order")
        .eq("learning_program_id", programId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      moduleSort = (lastMod?.sort_order ?? -1) + 1;
    }

    let anchorId: string | null = null;
    if (!replaceRoadmap) {
      const { data: existingRoot } = await supabase
        .from("learning_modules")
        .select("id")
        .eq("learning_program_id", programId)
        .is("parent_module_id", null)
        .maybeSingle();
      anchorId = existingRoot?.id ?? null;
    }

    for (const mod of plan.modules) {
      const parent_module_id = anchorId;
      const { data: insertedMod, error: me } = await supabase
        .from("learning_modules")
        .insert({
          learning_program_id: programId,
          title: mod.title,
          description: mod.description,
          sort_order: moduleSort++,
          parent_module_id,
        })
        .select("id")
        .single();

      if (me || !insertedMod) {
        return fail(400, { message: me?.message ?? "Could not create module." });
      }

      if (anchorId === null) {
        anchorId = insertedMod.id;
      }

      let sessionOrder = 0;
      for (const s of mod.sessions) {
        const planned_start_date = addDays(today, s.startOffsetDays);
        const planned_end_date = addDays(
          planned_start_date,
          Math.max(0, s.spanDays - 1),
        );

        const { error: se } = await supabase.from("learning_sessions").insert({
          learning_module_id: insertedMod.id,
          name: s.name,
          session_type: s.session_type,
          sort_order: sessionOrder++,
          planned_start_date,
          planned_end_date,
          status: "planned",
          estimated_duration_minutes: s.estimated_duration_minutes ?? null,
        });

        if (se) return fail(400, { message: se.message });
      }
    }

    let weaknessSort = 0;
    if (!replaceRoadmap) {
      const { data: lastW } = await supabase
        .from("program_weaknesses")
        .select("sort_order")
        .eq("learning_program_id", programId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      weaknessSort = (lastW?.sort_order ?? -1) + 1;
    }

    for (const w of plan.weaknesses) {
      const { error: we } = await supabase.from("program_weaknesses").insert({
        learning_program_id: programId,
        title: w.title,
        description: w.description,
        priority: w.priority,
        sort_order: weaknessSort++,
      });
      if (we) return fail(400, { message: we.message });
    }

    for (const c of plan.flashcards) {
      const { error: fe } = await supabase.from("program_flashcards").insert({
        learning_program_id: programId,
        front_text: c.front_text,
        back_text: c.back_text,
      });
      if (fe) return fail(400, { message: fe.message });
    }

    for (const res of plan.resources) {
      const { error: re } = await supabase.from("metalearning_resources").insert({
        learning_program_id: programId,
        kind: res.kind,
        title: res.title,
        description: res.description,
        uri: res.uri,
      });
      if (re) return fail(400, { message: re.message });
    }

    return {
      success: true as const,
      message: "Mock assistant drafted modules, sessions, weaknesses, flashcards, and a sample link.",
    };
  },
};
