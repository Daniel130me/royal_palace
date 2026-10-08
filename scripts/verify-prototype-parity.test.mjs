import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "verify-prototype-parity.mjs");
const REQUIRED_REGISTER_REFERENCES = [
  "prototype-parity.manifest.json",
  "11C4P-1",
  "11C4P-2",
  "11C4P-3",
  "11C4P-4",
  "11C4P-5",
];

function validManifest() {
  return {
    schemaVersion: 1,
    expectedCapabilityCount: 1,
    baselines: {
      approved: {
        commit: "a".repeat(40),
        description: "Approved test prototype",
      },
    },
    visualReferences: ["approved-screen.png"],
    portals: [
      {
        id: "patient",
        prototypeBaseline: "approved",
        prototypeRoot: "prototype/patient",
        productionRoot: "production/patient",
        capabilities: [
          {
            id: "dashboard",
            file: "dashboard.tsx",
            status: "CONNECTED",
            checkpoint: "test",
          },
        ],
      },
    ],
  };
}

async function fixture(manifest = validManifest()) {
  const root = await mkdtemp(resolve(tmpdir(), "royal-palace-parity-"));
  const files = {
    manifest: resolve(root, "docs/prototype-parity.manifest.json"),
    register: resolve(root, "docs/PROTOTYPE_PRODUCTION_PARITY.md"),
    production: resolve(root, "production/patient/dashboard.tsx"),
    visual: resolve(root, "approved-screen.png"),
  };

  for (const path of Object.values(files)) await mkdir(dirname(path), { recursive: true });
  await writeFile(files.manifest, `${JSON.stringify(manifest)}\n`, "utf8");
  await writeFile(files.register, REQUIRED_REGISTER_REFERENCES.join("\n"), "utf8");
  await writeFile(files.production, "export {};\n", "utf8");
  await writeFile(files.visual, "synthetic-image-fixture\n", "utf8");

  return { files, root };
}

function verify(root) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PROTOTYPE_PARITY_TEST_ROOT: root },
  });
}

test("accepts a complete approved capability manifest", async (context) => {
  const { root } = await fixture();
  context.after(() => rm(root, { force: true, recursive: true }));

  const result = verify(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 approved capabilities/u);
});

test("rejects a missing production file for a connected capability", async (context) => {
  const { files, root } = await fixture();
  context.after(() => rm(root, { force: true, recursive: true }));
  await rm(files.production);

  const result = verify(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /patient\.dashboard references a missing file/u);
});

test("rejects a forbidden removed status", async (context) => {
  const manifest = validManifest();
  manifest.portals[0].capabilities[0].status = "REMOVED";
  const { root } = await fixture(manifest);
  context.after(() => rm(root, { force: true, recursive: true }));

  const result = verify(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported status REMOVED/u);
});

test("rejects a silent capability-count reduction", async (context) => {
  const manifest = validManifest();
  manifest.expectedCapabilityCount = 2;
  const { root } = await fixture(manifest);
  context.after(() => rm(root, { force: true, recursive: true }));

  const result = verify(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /2, but 1 capabilities are declared/u);
});
