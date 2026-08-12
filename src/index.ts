import { createRuntime, start } from "./app.js";

const runtime = createRuntime();
const runtimePromise = start(runtime);

runtimePromise
  .then((server) => {
    let stopping = false;
    const stop = (signal: NodeJS.Signals): void => {
      if (stopping) return;
      stopping = true;
      console.log(`Received ${signal}; shutting down.`);

      server.close((error) => {
        if (error) {
          console.error("Failed to close HTTP server", error);
          process.exitCode = 1;
        }

        if (!runtime.config.publicUrl) {
          runtime.bot.stop();
        }
        runtime.service.close();
        process.exit();
      });
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
