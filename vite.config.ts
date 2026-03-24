import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  // bits-ui + xyflow ship sources / use directory imports; bundle for SSR so Node resolves them.
  ssr: {
    noExternal: [
      "bits-ui",
      "@xyflow/svelte",
      "@xyflow/system",
      "@svelte-put/shortcut",
    ],
  },
});
