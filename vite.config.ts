// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Local dev only: the live backend sends no CORS headers, so a browser on localhost cannot call
// it directly. Set SUPABASE_DEV_PROXY_TARGET (in .env.local) and point VITE_SUPABASE_URL at the
// dev server; these paths are then forwarded to the backend. Builds are unaffected.
const proxyTarget = loadEnv("development", process.cwd(), "")["SUPABASE_DEV_PROXY_TARGET"];
const proxy = proxyTarget
  ? Object.fromEntries(
      ["/auth/v1", "/rest/v1", "/storage/v1", "/functions/v1", "/realtime/v1"].map((path) => [
        path,
        { target: proxyTarget, changeOrigin: true, ws: path === "/realtime/v1" },
      ]),
    )
  : undefined;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  ...(proxy ? { vite: { server: { proxy } } } : {}),
});
