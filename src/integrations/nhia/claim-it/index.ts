// =====================================================================
// NHIA CLAIM-it Integration — Main Entry Point
// =====================================================================
// Orchestrates: Database Adapter → ICO → Validation → XML Serialization → Transport
// =====================================================================

export { buildICOFromEncounter } from "./adapters/ClaimsDataAdapter";
export { validateICO } from "./validation/ClaimsValidator";
export { serializeNHIAClaim } from "./serialization/XMLSerializer";
export { createTransport, FileExportTransport, ClaimItBridgeTransport } from "./transport/NHIAClaimItTransport";
export { NHIA_XML_TAGS, NHIA_XML_CONFIG } from "./config/tags";
export * from "./types/claims";

// =====================================================================
// Full Pipeline: Encounter → ICO → Validate → Serialize → Export
// =====================================================================
import { buildICOFromEncounter } from "./adapters/ClaimsDataAdapter";
import { validateICO } from "./validation/ClaimsValidator";
import { serializeNHIAClaim } from "./serialization/XMLSerializer";
import { createTransport } from "./transport/NHIAClaimItTransport";
import type { ExportResult, ValidationResult } from "./types/claims";

export async function generateAndExportClaim(
  encounterId: string,
  organizationId: string,
  options?: { transportMode?: string; skipValidation?: boolean },
): Promise<{
  ico: any;
  validation: ValidationResult;
  xml: string | null;
  exportResult: ExportResult | null;
  warnings: string[];
}> {
  // Phase 1: Build ICO from database
  const { ico, warnings } = await buildICOFromEncounter(encounterId, organizationId);

  // Phase 2: Validate ICO
  const validation = validateICO(ico);

  if (!validation.valid && !options?.skipValidation) {
    return {
      ico,
      validation,
      xml: null,
      exportResult: null,
      warnings,
    };
  }

  // Phase 3: Serialize to XML
  const xml = serializeNHIAClaim(ico);

  // Phase 4: Export via transport
  const transport = createTransport(options?.transportMode);
  const exportResult = await transport.exportClaim(ico, xml);

  return {
    ico,
    validation,
    xml,
    exportResult,
    warnings,
  };
}
