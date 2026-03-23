/**
 * Browser-only Supabase client (PKCE, cookie-backed session).
 * On the server, use `event.locals.supabase` from `hooks.server.ts` instead.
 */
import { createBrowserClient } from "@supabase/ssr";
import {
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  PUBLIC_SUPABASE_URL,
} from "$env/static/public";

export const supabase = createBrowserClient(
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
