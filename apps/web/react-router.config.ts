import type { Config } from "@react-router/dev/config";
import { dynamicPrerenderPaths } from "./src/routing/prerenderRoutes";

export default {
  appDirectory: "src",
  // Emit real HTML for static routes and every known catalog URL so cold direct
  // visits paint useful content before the client bundle executes.
  prerender: {
    paths: ({ getStaticPaths }) => [
      ...getStaticPaths(),
      ...dynamicPrerenderPaths,
    ],
    concurrency: 8,
  },
  routeDiscovery: { mode: "initial" },
  ssr: false,
} satisfies Config;
