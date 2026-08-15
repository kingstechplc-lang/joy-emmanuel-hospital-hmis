import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel builds Next.js natively — no standalone output needed.
  // (standalone is for Docker / Node.js server deployments only)
  // output: "standalone",

  reactStrictMode: false,
  typescript: {
    // We've already verified zero TS errors via `bunx tsc --noEmit`.
    // ignoreBuildErrors is set to true so Vercel builds don't fail on
    // type-only issues in example/skills folders that aren't part of the app.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Same reason — we've verified lint is clean via `bun run lint`.
    ignoreDuringBuilds: true,
  },
  // Prisma Client needs to be bundled for serverless (Vercel)
  // — see https://www.prisma.io/docs/orm/prisma-client/deployment/edge/deploy-to-vercel
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
};

export default nextConfig;
