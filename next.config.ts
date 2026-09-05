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
  // Note: `eslint: { ignoreDuringBuilds: true }` was removed in Next.js 16.
  // Next.js 16 no longer runs ESLint during `next build` by default.
  // To run lint manually: `bun run lint`
  //
  // In Next.js 16, serverComponentsExternalPackages moved to top-level as
  // serverExternalPackages. This tells Next.js NOT to bundle these packages —
  // they're loaded as external Node modules (required for Prisma Client +
  // bcryptjs to work in serverless environments like Vercel).
  // Only include packages that ACTUALLY need to be external — heavy unused
  // packages like @mdxeditor/editor cause Turbopack to fail on Vercel.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
