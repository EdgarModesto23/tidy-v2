import { fail, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";
import type { LearningProgramReason } from "$lib/learning/types";
import { UUID_RE } from "$lib/learning/uuid";

function parseReason(v: FormDataEntryValue | null): LearningProgramReason | null {
  if (v === "instrumental" || v === "intrinsic") return v;
  return null;
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const { user } = await locals.safeGetSession();
    if (!user) return fail(401, { message: "Sign in required." });

    const fd = await request.formData();
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return fail(400, { message: "Name is required." });

    const reason = parseReason(fd.get("reason"));
    if (!reason) return fail(400, { message: "Choose a learning reason." });

    const description = String(fd.get("description") ?? "").trim() || null;
    const starting_point_description =
      String(fd.get("starting_point_description") ?? "").trim() || null;
    const reason_description =
      String(fd.get("reason_description") ?? "").trim() || null;
    const target_start_date =
      String(fd.get("target_start_date") ?? "").trim() || null;
    const target_end_date =
      String(fd.get("target_end_date") ?? "").trim() || null;

    const { data, error } = await locals.supabase
      .from("learning_programs")
      .insert({
        owner_id: user.id,
        name,
        description,
        starting_point_description,
        reason,
        reason_description,
        target_start_date,
        target_end_date,
      })
      .select("id")
      .single();

    if (error) {
      return fail(400, {
        message:
          error.message ||
          "Could not create program. Check that Supabase tables and RLS policies exist.",
      });
    }

    redirect(303, `/programs/${data.id}`);
  },

  deleteProgram: async ({ request, locals }) => {
    const { user } = await locals.safeGetSession();
    if (!user) return fail(401, { message: "Sign in required." });
    const fd = await request.formData();
    const id = String(fd.get("program_id") ?? "");
    if (!UUID_RE.test(id)) return fail(400, { message: "Invalid program." });
    const { data: row, error: qe } = await locals.supabase
      .from("learning_programs")
      .select("id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (qe || !row) return fail(404, { message: "Program not found." });
    const { error } = await locals.supabase.from("learning_programs").delete().eq("id", id);
    if (error) return fail(400, { message: error.message });
    return { success: true as const, message: "Program deleted." };
  },

  toggleProgramComplete: async ({ request, locals }) => {
    const { user } = await locals.safeGetSession();
    if (!user) return fail(401, { message: "Sign in required." });
    const fd = await request.formData();
    const id = String(fd.get("program_id") ?? "");
    if (!UUID_RE.test(id)) return fail(400, { message: "Invalid program." });
    const { data: row, error: qe } = await locals.supabase
      .from("learning_programs")
      .select("id, completed_at")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (qe || !row) return fail(404, { message: "Program not found." });
    const next = row.completed_at ? null : new Date().toISOString();
    const { error } = await locals.supabase
      .from("learning_programs")
      .update({
        completed_at: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return fail(400, { message: error.message });
    return {
      success: true as const,
      message: next ? "Marked as done." : "Marked as active.",
    };
  },
};
