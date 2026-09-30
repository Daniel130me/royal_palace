import { readFile } from "node:fs/promises";

import openapiTS, { astToString } from "openapi-typescript";

for (const name of ["public-discovery", "onboarding"]) {
  const specificationUrl = new URL(`../openapi/${name}.yaml`, import.meta.url);
  const generatedUrl = new URL(`../src/generated/${name}.ts`, import.meta.url);
  const expected = astToString(await openapiTS(specificationUrl));
  const actual = await readFile(generatedUrl, "utf8");
  if (normalize(actual) !== normalize(expected)) {
    throw new Error(`Generated ${name} client types are stale. Run pnpm generate.`);
  }
}

function normalize(value) {
  return value
    .replaceAll("\r\n", "\n")
    .replace(/^\/\*\*[\s\S]*?\*\/\n+/, "")
    .trimEnd();
}
