// =====================================================================
// NEXTAUTH ROUTE HANDLER
// =====================================================================
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
