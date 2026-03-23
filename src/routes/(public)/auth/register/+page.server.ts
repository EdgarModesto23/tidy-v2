import { base } from "$app/paths";
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
  const next = safeInternalPath(url.searchParams.get("next") ?? "/todo", "/todo");
  if (user) {
    redirect(303, next);
  }
  return {
    error: url.searchParams.get("error"),
    next,
  };
};

export const actions = {
  signup: async ({ request, locals, url }) => {
    const fd = await request.formData();
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const next = safeInternalPath(String(fd.get("redirectTo") ?? "/todo"), "/todo");

    if (!email || !password) {
      return fail(400, { error: "Email and password are required." });
    }
    if (password.length < 6) {
      return fail(400, {
        error: "Password must be at least 6 characters.",
      });
    }

    const { error } = await locals.supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${url.origin}${base}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      return fail(400, { error: error.message });
    }

    return {
      success: true,
      message:
        "Check your email to confirm your account, then sign in.",
    };
  },
} satisfies Actions;
