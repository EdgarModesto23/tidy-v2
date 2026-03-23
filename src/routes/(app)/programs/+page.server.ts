import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import type { LearningProgramReason } from "$lib/learning/types";

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) return { programs: [], loadError: null };

  const { data, error } = await locals.supabase
    .from("learning_programs")
    .select(
      "id, name, description, target_start_date, target_end_date, reason, updated_at",
    )
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  return {
    programs: data ?? [],
    loadError: error?.message ?? null,
  };
};

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
};
