import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Legacy `/auth/login` → `/auth/signin` (query string preserved). */
export const GET: RequestHandler = ({ url }) => {
  redirect(307, `/auth/signin${url.search}`);
};
