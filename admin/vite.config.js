import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* THE DASHBOARD (docs/admin.md). It reads the game's browser-free rule modules
   from ../src - level from xp, tier names, ranks, the League's ids - so it
   names everything the way the game does without a copy to drift. The root
   .env holds the same public Supabase keys the game uses; on Vercel they are
   the project's environment variables. */
export default defineConfig({
  plugins: [react()],
  envDir: "..",
  server: { port: 5300, fs: { allow: [".."] } },
  build: { target: "es2020", chunkSizeWarningLimit: 1200 },
});
