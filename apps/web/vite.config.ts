import { fileURLToPath } from "node:url";

import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { loadWebConfig } from "@veolms/config";
import { defineConfig, loadEnv } from "vite";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  const environment = {
    ...process.env,
    ...loadEnv(mode, workspaceRoot, ""),
  };
  const config = loadWebConfig(environment);

  return {
    envDir: workspaceRoot,
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    define: {
      "import.meta.env.STATIC_BUILD_API_URL": JSON.stringify(
        config.STATIC_BUILD_API_URL,
      ),
      "import.meta.env.VITE_COURSE_MEDIA_BASE_URL": JSON.stringify(
        config.VITE_COURSE_MEDIA_BASE_URL ?? "",
      ),
    },
    plugins: [tailwindcss(), reactRouter()],
    server: {
      port: config.WEB_PORT,
      strictPort: true,
      proxy: {
        "/api": {
          target: new URL(config.STATIC_BUILD_API_URL).origin,
          changeOrigin: true,
        },
      },
    },
  };
});
