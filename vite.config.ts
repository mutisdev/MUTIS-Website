import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Module workers (the admin PDF compressor is started with { type: "module" }).
  worker: { format: "es" },
  resolve: {
    alias: {
      "@": "/application",
      // Code shared with the Supabase Edge Functions (e.g. the uni-email rules).
      "@shared": "/supabase/functions/_shared",
    },
  },
});
