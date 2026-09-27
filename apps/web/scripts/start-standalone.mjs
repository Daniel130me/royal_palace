import { spawn } from "node:child_process";
import path from "node:path";

import { resolveStandaloneServer } from "./standalone-paths.mjs";

const serverPath = await resolveStandaloneServer();
const server = spawn(process.execPath, [serverPath], {
  cwd: path.dirname(serverPath),
  env: { ...process.env, NODE_ENV: "production" },
  stdio: "inherit",
});

const shutdownSignals = ["SIGINT", "SIGTERM"];

for (const signal of shutdownSignals) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
