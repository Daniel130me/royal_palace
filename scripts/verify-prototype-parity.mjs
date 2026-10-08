import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(
  process.env.PROTOTYPE_PARITY_TEST_ROOT ?? resolve(scriptDirectory, ".."),
);
const manifestPath = resolve(
  repositoryRoot,
  process.env.PROTOTYPE_PARITY_TEST_MANIFEST ?? "docs/prototype-parity.manifest.json",
);
const isIsolatedTestFixture = process.env.PROTOTYPE_PARITY_TEST_ROOT !== undefined;
const registerPath = resolve(repositoryRoot, "docs/PROTOTYPE_PRODUCTION_PARITY.md");

const ALLOWED_STATUSES = new Set([
  "CONNECTED",
  "IN_PROGRESS",
  "PENDING",
  "CORRECTIVE",
  "BLOCKED",
  "REVIEW_REQUIRED",
  "ACCEPTED",
]);
const STATUSES_WITHOUT_CURRENT_FILES = new Set(["CORRECTIVE", "BLOCKED", "REVIEW_REQUIRED"]);
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;

const errors = [];

function fail(message) {
  errors.push(message);
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const resolved = resolve(repositoryRoot, value);
  return resolved === repositoryRoot || resolved.startsWith(`${repositoryRoot}${sep}`);
}

async function requireFile(relativePath, context) {
  if (!isSafeRelativePath(relativePath)) {
    fail(`${context} has an unsafe or invalid path: ${String(relativePath)}`);
    return;
  }

  try {
    const metadata = await stat(resolve(repositoryRoot, relativePath));
    if (!metadata.isFile()) fail(`${context} must reference a file: ${relativePath}`);
  } catch {
    fail(`${context} references a missing file: ${relativePath}`);
  }
}

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  throw new Error(`Unable to read prototype parity manifest: ${error.message}`, {
    cause: error,
  });
}

if (manifest.schemaVersion !== 1) fail("schemaVersion must be 1");
if (!Number.isInteger(manifest.expectedCapabilityCount) || manifest.expectedCapabilityCount < 1) {
  fail("expectedCapabilityCount must be a positive integer");
}

const baselineKeys = new Set(Object.keys(manifest.baselines ?? {}));
for (const [key, baseline] of Object.entries(manifest.baselines ?? {})) {
  if (!ID_PATTERN.test(key)) fail(`baseline key is invalid: ${key}`);
  if (!SHA_PATTERN.test(baseline?.commit ?? "")) fail(`baseline ${key} must use a full Git SHA`);
  if (typeof baseline?.description !== "string" || baseline.description.trim().length === 0) {
    fail(`baseline ${key} requires a description`);
  }
}

for (const visualReference of manifest.visualReferences ?? []) {
  await requireFile(visualReference, "visual reference");
}

const portalIds = new Set();
const capabilityIds = new Set();
const verifiedPrototypeReferences = new Set();
let capabilityCount = 0;

for (const portal of manifest.portals ?? []) {
  if (!ID_PATTERN.test(portal?.id ?? "")) {
    fail(`portal id is invalid: ${String(portal?.id)}`);
    continue;
  }
  if (portalIds.has(portal.id)) fail(`duplicate portal id: ${portal.id}`);
  portalIds.add(portal.id);

  if (!baselineKeys.has(portal.prototypeBaseline)) {
    fail(`portal ${portal.id} references unknown baseline ${String(portal.prototypeBaseline)}`);
  }
  if (!isSafeRelativePath(portal.productionRoot)) {
    fail(`portal ${portal.id} has an invalid productionRoot`);
  }
  if (!Array.isArray(portal.capabilities) || portal.capabilities.length === 0) {
    fail(`portal ${portal.id} must declare capabilities`);
    continue;
  }

  for (const capability of portal.capabilities) {
    capabilityCount += 1;
    const qualifiedId = `${portal.id}.${capability?.id ?? ""}`;
    if (!ID_PATTERN.test(capability?.id ?? "")) fail(`capability id is invalid: ${qualifiedId}`);
    if (capabilityIds.has(qualifiedId)) fail(`duplicate capability id: ${qualifiedId}`);
    capabilityIds.add(qualifiedId);

    const baselineKey = capability.prototypeBaseline ?? portal.prototypeBaseline;
    if (!baselineKeys.has(baselineKey)) {
      fail(`${qualifiedId} references unknown baseline ${String(baselineKey)}`);
    }
    const prototypeRoot = capability.prototypeRoot ?? portal.prototypeRoot;
    if (typeof prototypeRoot !== "string" || prototypeRoot.length === 0) {
      fail(`${qualifiedId} requires a prototypeRoot`);
    }
    if (typeof capability.file !== "string" || capability.file.length === 0) {
      fail(`${qualifiedId} requires a prototype file`);
    }
    if (!isIsolatedTestFixture && typeof prototypeRoot === "string" && capability.file) {
      const commit = manifest.baselines[baselineKey]?.commit;
      const prototypePath = `${prototypeRoot}/${capability.file}`;
      const reference = `${commit}:${prototypePath}`;
      if (!verifiedPrototypeReferences.has(reference)) {
        const result = spawnSync("git", ["cat-file", "-e", reference], {
          cwd: repositoryRoot,
          encoding: "utf8",
          shell: false,
        });
        if (result.error !== undefined || result.status !== 0) {
          fail(`${qualifiedId} references a missing prototype artifact: ${reference}`);
        }
        verifiedPrototypeReferences.add(reference);
      }
    }
    if (!ALLOWED_STATUSES.has(capability.status)) {
      fail(`${qualifiedId} has unsupported status ${String(capability.status)}`);
    }
    if (typeof capability.checkpoint !== "string" || capability.checkpoint.trim().length === 0) {
      fail(`${qualifiedId} requires a delivery checkpoint`);
    }

    const productionFiles = capability.productionFiles ?? [
      `${portal.productionRoot}/${capability.file}`,
    ];
    if (!Array.isArray(productionFiles)) {
      fail(`${qualifiedId} productionFiles must be an array`);
      continue;
    }
    if (!STATUSES_WITHOUT_CURRENT_FILES.has(capability.status) && productionFiles.length === 0) {
      fail(`${qualifiedId} must reference its current production files`);
    }
    for (const productionFile of productionFiles) {
      await requireFile(productionFile, qualifiedId);
    }
  }
}

if (capabilityCount !== manifest.expectedCapabilityCount) {
  fail(
    `expectedCapabilityCount is ${manifest.expectedCapabilityCount}, but ${capabilityCount} capabilities are declared`,
  );
}

await requireFile("docs/PROTOTYPE_PRODUCTION_PARITY.md", "parity register");
const register = await readFile(registerPath, "utf8");
for (const requiredReference of [
  "prototype-parity.manifest.json",
  "11C4P-1",
  "11C4P-2",
  "11C4P-3",
  "11C4P-4",
  "11C4P-5",
]) {
  if (!register.includes(requiredReference)) {
    fail(`parity register must reference ${requiredReference}`);
  }
}

if (errors.length > 0) {
  console.error("Prototype parity verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Prototype parity verified: ${capabilityCount} approved capabilities across ${portalIds.size} portals; ${manifest.visualReferences.length} visual references present; ${verifiedPrototypeReferences.size} historical artifacts confirmed.`,
  );
}
