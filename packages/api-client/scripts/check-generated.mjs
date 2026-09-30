import { readFile } from "node:fs/promises";

import openapiTS, { astToString } from "openapi-typescript";

const specificationUrl = new URL("../openapi/public-discovery.yaml", import.meta.url);
const generatedUrl = new URL("../src/generated/public-discovery.ts", import.meta.url);
const expected = astToString(await openapiTS(specificationUrl));
const actual = await readFile(generatedUrl, "utf8");

if (normalize(actual) !== normalize(expected)) {
  throw new Error("Generated public discovery client types are stale. Run pnpm generate.");
}

function normalize(value) {
  return value
    .replaceAll("\r\n", "\n")
    .replace(/^\/\*\*[\s\S]*?\*\/\n+/, "")
    .trimEnd();
}
