import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
export const webDirectory = path.resolve(scriptsDirectory, "..");

const standaloneDirectory = path.join(webDirectory, ".next", "standalone");
const serverCandidates = [
  path.join(standaloneDirectory, "apps", "web", "server.js"),
  path.join(standaloneDirectory, "server.js"),
];

export async function resolveStandaloneServer() {
  for (const candidate of serverCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Candidate layouts differ between standalone and monorepo Next.js builds.
    }
  }

  throw new Error(
    `Next.js standalone server was not found. Checked: ${serverCandidates.join(", ")}`,
  );
}
