import { error, fail, redirect } from "@sveltejs/kit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMockLearningPlan } from "$lib/learning/mock-ai";
import type {
  LearningProgramReason,
  LearningSessionRow,
  LearningSessionType,
  MetalearningResourceKind,
} from "$lib/learning/types";
import type { Actions, PageServerLoad } from "./$types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!UUID_RE.test(params.programId)) error(404, "Not found");

  const { user } = await locals.safeGetSession();
  if (!user) error(401, "Unauthorized");

  const supabase = locals.supabase;

  const { data: program, error: pErr } = await supabase
    .from("learning_programs")
    .select("*")
    .eq("id", params.programId)
    .eq("owner_id", user.id)
    .maybeSingle();

  const todayIso = utcTodayIso();

  if (pErr) {
    return {
      program: null,
      modules: [],
      weaknesses: [],
      sessionsByModule: {},
      flashcards: [],
      resources: [],
      loadError: pErr.message,
      todayIso,
    };
  }

  if (!program) error(404, "Program not found");

  const { data: modules, error: mErr } = await supabase
    .from("learning_modules")
    .select("*")
    .eq("learning_program_id", program.id)
    .order("sort_order", { ascending: true });

  if (mErr) {
    return {
      program,
      modules: [],
      weaknesses: [],
      sessionsByModule: {},
      flashcards: [],
      resources: [],
      loadError: mErr.message,
      todayIso,
    };
  }

  const moduleList = modules ?? [];
  const moduleIds = moduleList.map((m) => m.id);

  let sessionsByModule: Record<string, LearningSessionRow[]> = {};

  if (moduleIds.length > 0) {
    const { data: sessions, error: sErr } = await supabase
      .from("learning_sessions")
      .select("*")
      .in("learning_module_id", moduleIds)
      .order("sort_order", { ascending: true });

    if (sErr) {
      return {
        program,
        modules: moduleList,
        weaknesses: [],
        sessionsByModule: {},
        flashcards: [],
        resources: [],
        loadError: sErr.message,
        todayIso,
      };
    }

    sessionsByModule = {};
    for (const id of moduleIds) sessionsByModule[id] = [];
    for (const row of sessions ?? []) {
      const list = sessionsByModule[row.learning_module_id];
      if (list) list.push(row);
    }
  }

  const { data: weaknesses, error: wErr } = await supabase
    .from("program_weaknesses")
    .select("*")
    .eq("learning_program_id", program.id)
    .order("sort_order", { ascending: true });

  if (wErr) {
    return {
      program,
      modules: moduleList,
      weaknesses: [],
      sessionsByModule,
      flashcards: [],
      resources: [],
      loadError: wErr.message,
      todayIso,
    };
  }

  const { data: flashcards, error: fErr } = await supabase
    .from("program_flashcards")
    .select("*")
    .eq("learning_program_id", program.id)
    .order("created_at", { ascending: false });

  if (fErr) {
    return {
      program,
      modules: moduleList,
      weaknesses: weaknesses ?? [],
      sessionsByModule,
      flashcards: [],
      resources: [],
      loadError: fErr.message,
      todayIso,
    };
  }

  const { data: resources, error: rErr } = await supabase
    .from("metalearning_resources")
    .select("*")
    .eq("learning_program_id", program.id)
    .order("created_at", { ascending: true });

  return {
    program,
    modules: moduleList,
    weaknesses: weaknesses ?? [],
    sessionsByModule,
    flashcards: flashcards ?? [],
    resources: resources ?? [],
    loadError: rErr?.message ?? null,
    todayIso,
  };
};

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

    for (const mod of plan.modules) {
      const { data: insertedMod, error: me } = await supabase
        .from("learning_modules")
        .insert({
          learning_program_id: programId,
          title: mod.title,
          description: mod.description,
          sort_order: moduleSort++,
        })
        .select("id")
        .single();

      if (me || !insertedMod) {
        return fail(400, { message: me?.message ?? "Could not create module." });
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
