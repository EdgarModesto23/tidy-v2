import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  // bits-ui ships .svelte sources; SSR must bundle them so Node never loads them raw.
  ssr: {
    noExternal: ["bits-ui"],
  },
});
