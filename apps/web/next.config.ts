import path from "path";
import type { NextConfig } from "next";

// Local dev convenience: the browser builds API URLs with an empty API base
// (same-origin /api/...). In production nginx routes /api to the backend
// before Next ever sees it; the Next dev server has no API routes of its own,
// so mirror nginx here by proxying /api to the backend process. Dev-only —
// production returns no rewrites and keeps the nginx path untouched.
const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  // Make `next build`'s file tracing include the whole monorepo so the
  // standalone server bundles workspace deps (e.g. @prodapp/shared-types).
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;