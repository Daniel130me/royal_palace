import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

import { resolveStandaloneServer, webDirectory } from "./standalone-paths.mjs";

const serverPath = await resolveStandaloneServer();
const serverDirectory = path.dirname(serverPath);
const staticSource = path.join(webDirectory, ".next", "static");
const staticTarget = path.join(serverDirectory, ".next", "static");
const publicSource = path.join(webDirectory, "public");
const publicTarget = path.join(serverDirectory, "public");

await mkdir(path.dirname(staticTarget), { recursive: true });
await cp(staticSource, staticTarget, { recursive: true, force: true });
await cp(publicSource, publicTarget, { recursive: true, force: true });

console.log(`Standalone assets packaged beside ${path.relative(webDirectory, serverPath)}.`);
