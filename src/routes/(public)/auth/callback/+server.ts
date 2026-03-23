import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const code = event.url.searchParams.get("code");
  const nextParam = event.url.searchParams.get("next") ?? "/todo";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/todo";

  if (code) {
    const { error } =
      await event.locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(303, next);
    }
  }

  redirect(303, "/auth/signin?error=Could%20not%20authenticate");
};
