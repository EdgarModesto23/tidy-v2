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

  const signinHref = $derived(
    `${resolve("/auth/signin")}?${new URLSearchParams({ next: data.next }).toString()}`,
  );

  const queryError = $derived(data.error);
  const actionError = $derived(
    page.form && "error" in page.form ? String(page.form.error) : null,
  );
  const displayError = $derived(
    actionError ?? queryError ?? googleOauthError,
  );
  const successMessage = $derived(
    page.form && "success" in page.form && page.form.success
      ? String(page.form.message ?? "")
      : "",
  );
</script>

<main class="mx-auto flex w-full max-w-md flex-col gap-6">
  <header class="text-center">
    <p
      class="text-primary mb-1 text-xs font-semibold tracking-widest uppercase"
    >
      Tidy
    </p>
    <h1 class="text-foreground text-2xl font-semibold tracking-tight">
      Create account
    </h1>
    <p class="text-muted-foreground mt-2 text-sm">
      Register to use the app.
    </p>
    <p class="text-muted-foreground text-sm">
      <a href={signinHref} class="text-primary font-medium hover:underline"
        >Already have an account? Sign in</a
      >
    </p>
  </header>

  <Card>
    <CardHeader class="pb-4">
      <CardTitle class="text-lg">Register</CardTitle>
      <CardDescription
        >Google creates your account on first use. With email, you may need to
        confirm via inbox.</CardDescription
      >
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

      {#if successMessage}
        <p
          class="border-primary/30 bg-primary/10 text-foreground rounded-2xl border px-3 py-2 text-sm"
          role="status"
        >
          {successMessage}
        </p>
      {/if}

      <GoogleOAuthButton next={data.next} onError={(m) => (googleOauthError = m)} />

      <div class="relative">
        <div class="absolute inset-0 flex items-center" aria-hidden="true">
          <div class="border-border w-full border-t"></div>
        </div>
        <div class="relative flex justify-center text-xs uppercase">
          <span class="bg-card text-muted-foreground px-2">or with email</span>
        </div>
      </div>

      <form method="POST" action="?/signup" class="space-y-4">
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
            autocomplete="new-password"
            required
            minlength={6}
            placeholder="At least 6 characters"
          />
        </div>
        <Button type="submit" class="w-full">Create account</Button>
      </form>
    </CardContent>
  </Card>
</main>
