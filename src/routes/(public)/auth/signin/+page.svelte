<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import GoogleOAuthButton from "$lib/components/auth/google-oauth-button.svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  let googleOauthError = $state<string | null>(null);

  const registerHref = $derived(
    `${resolve("/auth/register")}?${new URLSearchParams({ next: data.next }).toString()}`,
  );

  const queryError = $derived(data.error);
  const actionError = $derived(
    page.form && "error" in page.form ? String(page.form.error) : null,
  );
  const displayError = $derived(actionError ?? queryError ?? googleOauthError);
</script>

<main class="mx-auto flex w-full max-w-md flex-col gap-6">
  <header class="text-center">
    <p
      class="text-primary mb-1 text-xs font-semibold tracking-widest uppercase"
    >
      Tidy
    </p>
    <h1 class="text-foreground text-2xl font-semibold tracking-tight">
      Sign in
    </h1>
    <p class="text-muted-foreground mt-2 text-sm">Sign in to open the app.</p>
  </header>

  <Card>
    <CardHeader class="pb-4">
      <CardTitle class="text-lg">Sign in</CardTitle>
      <CardDescription>Email and password or Google.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-6 pt-0">
      {#if displayError}
        <p
          class="border-destructive/30 bg-destructive/10 text-destructive rounded-2xl border px-3 py-2 text-sm"
          role="alert"
        >
          {displayError}
        </p>
      {/if}

      <GoogleOAuthButton
        next={data.next}
        onError={(m) => (googleOauthError = m)}
      />

      <div class="relative">
        <div class="absolute inset-0 flex items-center" aria-hidden="true">
          <div class="border-border w-full border-t"></div>
        </div>
        <div class="relative flex justify-center text-xs uppercase">
          <span class="bg-card text-muted-foreground px-2">or with email</span>
        </div>
      </div>

      <form method="POST" action="?/login" class="space-y-4">
        <input type="hidden" name="redirectTo" value={data.next} />
        <div class="space-y-2">
          <label for="email" class="text-sm font-medium">Email</label>
          <Input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            required
            placeholder="you@example.com"
          />
        </div>
        <div class="space-y-2">
          <label for="password" class="text-sm font-medium">Password</label>
          <Input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            minlength={6}
            placeholder="••••••••"
          />
        </div>
        <Button type="submit" class="w-full">Sign in</Button>
      </form>
      <div class="flex items-center">
        <p class="text-muted-foreground mx-auto text-sm">
          Dont have an account yet?
          <a
            href={registerHref}
            class="text-primary font-medium hover:underline"
            >Create an account</a
          >
        </p>
      </div>
    </CardContent>
  </Card>
</main>
