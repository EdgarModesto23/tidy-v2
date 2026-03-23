<script lang="ts">
  import { browser } from "$app/environment";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";
  import GoogleGLogo from "$lib/components/icons/google-g-logo.svelte";
  import { supabase } from "$lib/supabaseClient";

  let {
    next,
    onError,
    label = "Continue with Google",
  }: {
    next: string;
    onError?: (message: string | null) => void;
    label?: string;
  } = $props();

  let googleLoading = $state(false);

  async function signInWithGoogle() {
    if (!browser) return;
    googleLoading = true;
    onError?.(null);
    const redirectTo = `${page.url.origin}${resolve("/auth/callback")}?next=${encodeURIComponent(next)}`;
    const { data: oauth, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      googleLoading = false;
      onError?.(error.message);
      return;
    }
    if (oauth?.url) {
      window.location.assign(oauth.url);
      return;
    }
    googleLoading = false;
    onError?.("Could not start Google sign-in.");
  }
</script>

<Button
  type="button"
  variant="outline"
  class="border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f8f9fa] dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#282a2c] h-11 w-full gap-3 font-medium"
  onclick={signInWithGoogle}
  disabled={googleLoading}
  aria-busy={googleLoading}
>
  <GoogleGLogo class="size-[18px]" />
  {googleLoading ? "Connecting…" : label}
</Button>
