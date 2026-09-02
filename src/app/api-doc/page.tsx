"use client";
// =====================================================================
// Swagger UI Page — /api-doc
// =====================================================================
// Serves Swagger UI with the OpenAPI spec.
// Must be a Client Component because swagger-ui-react uses browser-only APIs.
// =====================================================================
import { getApiDocs } from "@/lib/swagger";
import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function ApiDocPage() {
  return <SwaggerUI spec={getApiDocs()} />;
}
