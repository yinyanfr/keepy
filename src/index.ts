import { start } from "./app.js";

start().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
