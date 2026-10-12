import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const configuredWebOrigin = process.env.WEB_ORIGIN;
const localReviewOrigin =
  process.env.APP_ENV === "development" && configuredWebOrigin !== undefined
    ? new URL(configuredWebOrigin).hostname
    : undefined;

const nextConfig: NextConfig = {
  ...(localReviewOrigin === undefined ? {} : { allowedDevOrigins: [localReviewOrigin] }),
  agentRules: false,
  output: "standalone",
  outputFileTracingRoot: path.resolve(projectDirectory, "../.."),
  reactStrictMode: false,
};

export default nextConfig;
