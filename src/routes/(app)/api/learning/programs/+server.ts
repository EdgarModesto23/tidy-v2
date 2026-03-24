import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) error(401, "Unauthorized");

  const { data, error: qErr } = await locals.supabase
    .from("learning_programs")
    .select(
      "id, name, description, target_start_date, target_end_date, reason, updated_at, completed_at",
    )
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  const programs = data ?? [];
  let list_version = 0;
  for (const p of programs) {
    const t = new Date(p.updated_at).getTime();
    if (Number.isFinite(t) && t > list_version) list_version = t;
  }

  return json({
    programs,
    loadError: qErr?.message ?? null,
    list_version,
  });
};
