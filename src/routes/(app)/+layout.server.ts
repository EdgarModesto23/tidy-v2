import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

/**
 * Everything under (app) requires a validated session. Unauthenticated users
 * stay on the public login flow only.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
  const { user } = await locals.safeGetSession();
  if (!user) {
    const next = url.pathname + url.search;
    redirect(
      303,
      `/auth/signin?next=${encodeURIComponent(next || "/todo")}`,
    );
  }
  return { userId: user.id };
};
