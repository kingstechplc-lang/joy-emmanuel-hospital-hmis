// =====================================================================
// NHIA Claims Transport Interface
// =====================================================================
// Abstract transport layer. Multiple implementations possible:
// - FileExportTransport: writes XML to disk (offline/flash drive)
// - ClaimItBridgeTransport: sends to CLAIM-it HMS bridge (localhost:31719)
// =====================================================================

import type { IntermediateClaimsObject, ExportResult, HealthCheckResult } from "../types/claims";

export interface NHIAClaimsTransport {
  /** Export a single claim as XML */
  exportClaim(ico: IntermediateClaimsObject, xml: string): Promise<ExportResult>;

  /** Check if the transport endpoint is reachable */
  healthCheck(): Promise<HealthCheckResult>;
}

// =====================================================================
// File Export Transport — writes XML to a downloadable file
// =====================================================================
export class FileExportTransport implements NHIAClaimsTransport {
  private outputDir: string;

  constructor(outputDir: string = "/tmp/nhia-exports") {
    this.outputDir = outputDir;
  }

  async exportClaim(ico: IntermediateClaimsObject, xml: string): Promise<ExportResult> {
    try {
      const filename = `${ico.header.claimNumber}.xml`;
      // In a Next.js server context, we return the XML as a downloadable response
      // rather than writing to disk. The API route will handle the file download.
      return {
        success: true,
        claimRef: ico.header.claimNumber,
        xmlPayload: xml,
        filePath: `${this.outputDir}/${filename}`,
        errors: [],
        timestamp: new Date(),
      };
    } catch (e: any) {
      return {
        success: false,
        claimRef: ico.header.claimNumber,
        errors: [{
          code: "FILE_EXPORT_ERROR",
          category: "TRANSPORT" as const,
          field: "transport",
          message: e?.message || "File export failed",
          severity: "ERROR" as const,
        }],
        timestamp: new Date(),
      };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      reachable: true,
      endpoint: "file-export",
      version: "1.0",
    };
  }
}

// =====================================================================
// CLAIM-it Bridge Transport — sends XML to local CLAIM-it HMS bridge
// =====================================================================
export class ClaimItBridgeTransport implements NHIAClaimsTransport {
  private bridgeUrl: string;
  private timeoutMs: number;
  private retryCount: number;

  constructor(options: {
    bridgeUrl?: string;
    timeoutMs?: number;
    retryCount?: number;
  } = {}) {
    this.bridgeUrl = options.bridgeUrl || process.env.NHIA_CLAIMIT_BRIDGE_URL || "http://localhost:31719";
    this.timeoutMs = options.timeoutMs || parseInt(process.env.NHIA_CLAIMIT_TIMEOUT_MS || "15000", 10);
    this.retryCount = options.retryCount || parseInt(process.env.NHIA_CLAIMIT_RETRY_COUNT || "3", 10);
  }

  async exportClaim(ico: IntermediateClaimsObject, xml: string): Promise<ExportResult> {
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const res = await fetch(`${this.bridgeUrl}/api/claims/import`, {
          method: "POST",
          headers: { "Content-Type": "application/xml" },
          body: xml,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            success: true,
            claimRef: ico.header.claimNumber,
            submissionRef: data.submissionRef || data.ref || null,
            errors: [],
            timestamp: new Date(),
          };
        }

        const errorBody = await res.text().catch(() => "");
        lastError = `Bridge returned ${res.status}: ${errorBody.slice(0, 200)}`;

        // Don't retry on 4xx (client error)
        if (res.status >= 400 && res.status < 500) break;
      } catch (e: any) {
        lastError = e?.name === "AbortError" ? `Bridge timeout after ${this.timeoutMs}ms` : (e?.message || "Bridge connection failed");
      }

      // Wait before retry (exponential backoff)
      if (attempt < this.retryCount) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    return {
      success: false,
      claimRef: ico.header.claimNumber,
      errors: [{
        code: "BRIDGE_TRANSPORT_ERROR",
        category: "TRANSPORT",
        field: "transport.bridge",
        message: lastError || "Bridge transport failed after all retries",
        severity: "ERROR",
      }],
      timestamp: new Date(),
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${this.bridgeUrl}/api/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          reachable: true,
          endpoint: this.bridgeUrl,
          version: data.version || "unknown",
        };
      }

      return {
        reachable: false,
        endpoint: this.bridgeUrl,
        error: `Health check returned ${res.status}`,
      };
    } catch (e: any) {
      return {
        reachable: false,
        endpoint: this.bridgeUrl,
        error: e?.message || "Bridge unreachable",
      };
    }
  }
}

// =====================================================================
// Transport Factory
// =====================================================================
export function createTransport(mode?: string): NHIAClaimsTransport {
  const transportMode = mode || process.env.NHIA_CLAIMIT_TRANSPORT || "file";

  if (transportMode === "bridge") {
    return new ClaimItBridgeTransport();
  }

  return new FileExportTransport();
}
