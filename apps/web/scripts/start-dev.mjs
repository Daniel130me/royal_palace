import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const webOriginValue = process.env.WEB_ORIGIN;

if (!webOriginValue) {
  throw new Error(
    "WEB_ORIGIN is required. Set it in the repository .env.local file before starting the web application.",
  );
}

let webOrigin;

try {
  webOrigin = new URL(webOriginValue);
} catch (error) {
  throw new Error(`WEB_ORIGIN must be a valid absolute URL; received ${webOriginValue}.`, {
    cause: error,
  });
}

const allowedDevelopmentProtocols = new Set(["http:", "https:"]);
const allowedDevelopmentHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const hostname = webOrigin.hostname.replace(/^\[|\]$/g, "");

if (!allowedDevelopmentProtocols.has(webOrigin.protocol)) {
  throw new Error(
    `WEB_ORIGIN must use HTTP or HTTPS; received ${webOrigin.protocol}.`,
  );
}

if (!allowedDevelopmentHosts.has(hostname)) {
  throw new Error(
    `The development server must use a loopback WEB_ORIGIN; received ${webOrigin.origin}.`,
  );
}

if (webOrigin.pathname !== "/" || webOrigin.search || webOrigin.hash) {
  throw new Error(
    `WEB_ORIGIN must not contain a path, query, or fragment; received ${webOrigin.href}.`,
  );
}

const port = webOrigin.port || (webOrigin.protocol === "https:" ? "443" : "80");
const webDirectory = fileURLToPath(new URL("..", import.meta.url));
const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);

const child = spawn(
  process.execPath,
  [nextCli, "dev", "--hostname", hostname, "--port", port],
  {
    cwd: webDirectory,
    env: process.env,
    stdio: "inherit",
  },
);

child.once("error", (error) => {
  console.error("Unable to start the Next.js development server.", error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}
