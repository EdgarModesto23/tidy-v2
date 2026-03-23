import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

function safeInternalPath(path: string, fallback: string) {
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}

export const load: PageServerLoad = async ({
  url,
  locals: { safeGetSession },
}) => {
  const { user } = await safeGetSession();
  const next = safeInternalPath(
    url.searchParams.get("next") ?? "/programs",
    "/programs",
  );
  if (user) {
    redirect(303, next);
  }
  return {
    error: url.searchParams.get("error"),
    next,
  };
};

export const actions = {
  login: async ({ request, locals }) => {
    const fd = await request.formData();
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const next = safeInternalPath(
      String(fd.get("redirectTo") ?? "/programs"),
      "/programs",
    );

    if (!email || !password) {
      return fail(400, { error: "Email and password are required." });
    }

    const { error } = await locals.supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return fail(400, { error: error.message });
    }

    redirect(303, next);
  },
} satisfies Actions;
