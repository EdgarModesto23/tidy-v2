import type { SubmitFunction } from "@sveltejs/kit";
import { Spinner } from "$lib/components/ui/spinner";

let toastRef: typeof import("svelte-sonner").toast | null = null;

async function getToast() {
  if (typeof window === "undefined") return null;
  if (!toastRef) {
    const mod = await import("svelte-sonner");
    toastRef = mod.toast;
  }
  return toastRef;
}

export type DbActionToastEnhanceOptions = {
  onSuccess?: () => void | Promise<void>;
  onStart?: () => void;
  onDone?: () => void;
};

/**
 * Form `use:enhance` helper: loading toast, then success / error from action result (same pattern as program editor & list).
 */
export function dbActionToastEnhance(
  pendingMessage: string,
  successMessage: string,
  options?: DbActionToastEnhanceOptions,
): SubmitFunction {
  const { onSuccess, onStart, onDone } = options ?? {};
  return (_input) => {
    onStart?.();
    const id = crypto.randomUUID();
    const toastReady = getToast();
    void toastReady.then((toast) => {
      toast?.loading(pendingMessage, {
        id,
        position: "top-center",
        icon: Spinner,
      });
    });
    return async ({ result, update }) => {
      const toast = await toastReady;
      if (result.type === "failure") {
        const message =
          (result.data as { message?: string } | null)?.message ??
          "Database action failed.";
        toast?.error(message, { id, position: "top-center", icon: null });
      } else if (result.type === "error") {
        toast?.error("Unexpected server error.", {
          id,
          position: "top-center",
          icon: null,
        });
      } else {
        const message =
          (result.type === "redirect"
            ? successMessage
            : (result.data as { message?: string } | null)?.message) ??
          successMessage;
        toast?.success(message, { id, position: "top-center", icon: null });
      }
      const ok = result.type === "success" || result.type === "redirect";
      if (ok) {
        await onSuccess?.();
      }
      onDone?.();
      await update();
    };
  };
}
