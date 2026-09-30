import createClient from "openapi-fetch";

import type { paths } from "./generated/public-discovery.js";

export type { components, paths } from "./generated/public-discovery.js";

export function createPublicDiscoveryClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}
