import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** `/` — send signed-in users into the app, everyone else to sign-in. */
export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (user) {
    redirect(303, "/todo");
  }
  redirect(303, "/auth/signin");
};
