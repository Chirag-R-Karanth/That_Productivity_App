import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Make `next build`'s file tracing include the whole monorepo so the
  // standalone server bundles workspace deps (e.g. @prodapp/shared-types).
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;