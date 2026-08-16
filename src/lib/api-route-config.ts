/**
 * Route Segment Config — applied to every API route in the app.
 *
 * In Next.js 16, API routes that use `getServerSession()` or Prisma are
 * already dynamic. But Vercel's build tries to "prerender" routes during
 * `next build` to detect static-renderable ones. If it touches a route
 * that hits the database without DATABASE_URL being set at build time,
 * the build crashes silently after "Creating an optimized production build...".
 *
 * Setting `dynamic = "force-dynamic"` and `revalidate = 0` on every API
 * route tells Next.js to skip prerendering entirely and always render
 * them on-demand at runtime. This is the correct config for authenticated
 * API routes — they're inherently user-specific.
 *
 * Usage at the top of any API route file:
 *   import { apiRouteConfig } from "@/lib/api-route-config";
 *   export const { dynamic, revalidate, maxDuration } = apiRouteConfig;
 */
export const apiRouteConfig = {
  dynamic: "force-dynamic" as const,
  revalidate: 0,
  // Default maxDuration — override per route if needed (e.g., heavy queries).
  // Hobby tier supports 10s; Pro tier supports 60s. We set 30s as a safe
  // default that works on both (Hobby will cap to 10s automatically).
  maxDuration: 30,
};
