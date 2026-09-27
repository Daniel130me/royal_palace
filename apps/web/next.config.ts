import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(projectDirectory, "../.."),
  reactStrictMode: false,
};

export default nextConfig;
