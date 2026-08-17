export * from "./config/index.ts";
export * from "./client/index.ts";
export * from "./storage/index.ts";
export * from "./ffmpeg/index.ts";
export * from "./runner/index.ts";
export * from "./daemon/index.ts";

import { MediaWorkerDaemon } from "./daemon/daemon.ts";

// If launched directly from command line, start daemon and bind signal handlers
if (process.argv[1] && process.argv[1].endsWith("src/index.ts")) {
  const daemon = new MediaWorkerDaemon();
  daemon.setupSignalHandlers();
  void daemon.start().then(() => {
    console.info(
      `VeoLMS Media Worker [${daemon.config.workerId}] started successfully.`,
    );
  });
}
