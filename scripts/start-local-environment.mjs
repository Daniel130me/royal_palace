import { spawnSync } from "node:child_process";

const packageManagerPath = process.env.npm_execpath;

if (!packageManagerPath) {
  console.error("local:up must be run through the configured package manager.");
  process.exit(1);
}

const steps = [
  {
    command: "docker",
    args: [
      "compose",
      "--env-file",
      ".env.local",
      "-f",
      "infra/local/compose.yml",
      "up",
      "--build",
      "--detach",
      "--wait",
    ],
  },
  {
    command: process.execPath,
    args: [packageManagerPath, "--filter", "@royal-palace/api", "db:migrate:deploy"],
  },
  {
    command: process.execPath,
    args: [packageManagerPath, "--filter", "@royal-palace/api", "storage:local:init"],
  },
];

for (const step of steps) {
  const result = spawnSync(step.command, step.args, {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Unable to start ${step.command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
