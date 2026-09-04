// =====================================================================
// Ghana-specific Validation Helpers
// =====================================================================
// Used by the Register Patient form and API for:
//   - Ghana Card PIN validation (structural format GHA-XXXXXXXXX-X)
//   - Phone number normalization (Ghanaian format)
// =====================================================================

/**
 * Validate a Ghana Card Personal Identification Number (PIN).
 * Expected format: GHA-XXXXXXXXX-X (3 letters + dash + 9 digits + dash + 1 check digit)
 *
 * Note: The actual Ghana Card checksum algorithm is not publicly documented
 * in a form we can safely implement here. We enforce the structural format
 * and uniqueness (checked server-side). Checksum validation can be added
 * later when an authoritative specification is available.
 *
 * @returns { valid: boolean, normalized?: string, error?: string }
 */
export function validateGhanaCard(input: string): { valid: boolean; normalized?: string; error?: string } {
  if (!input) return { valid: true, normalized: "" }; // empty is valid (optional field)

  // Normalize: uppercase, remove all spaces
  const normalized = input.toUpperCase().replace(/\s/g, "");

  // Structural check: GHA-XXXXXXXXX-X
  // 3 uppercase letters, dash, exactly 9 digits, dash, exactly 1 digit
  const regex = /^GHA-\d{9}-\d$/;
  if (!regex.test(normalized)) {
    return {
      valid: false,
      error: "Ghana Card must be in the format GHA-XXXXXXXXX-X (e.g., GHA-123456789-0)",
    };
  }

  return { valid: true, normalized };
}

/**
 * Normalize a Ghanaian phone number to a consistent format.
 * Rules:
 *   - Remove spaces, dashes, parentheses
 *   - If starts with 0 (local format, e.g. 024xxxxxxx), convert to +233 prefix
 *   - If starts with 233 (e.g. 23324xxxxxxx), add + prefix
 *   - If starts with +233, keep as-is
 *   - International numbers (not Ghana) are kept as-is (with + if present)
 *
 * Returns the normalized phone string (or empty string if input is empty).
 */
export function normalizeGhanaPhone(input: string): string {
  if (!input) return "";

  // Strip whitespace, dashes, parentheses
  let cleaned = input.replace(/[\s\-()]/g, "");

  // If empty after cleaning, return empty
  if (!cleaned) return "";

  // If already international format with +, keep as-is
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // Ghanaian local format: 0XXXXXXXXX (10 digits, starts with 0)
  // Convert to +233XXXXXXXXX (drop leading 0, add +233)
  if (/^0\d{9}$/.test(cleaned)) {
    return "+233" + cleaned.slice(1);
  }

  // Ghanaian with 233 prefix but no +: 233XXXXXXXXX (12 digits)
  if (/^233\d{9}$/.test(cleaned)) {
    return "+" + cleaned;
  }

  // If it's a 9-digit number without 0 prefix (e.g., 24xxxxxxx), assume Ghana
  if (/^\d{9}$/.test(cleaned)) {
    return "+233" + cleaned;
  }

  // Otherwise, keep as-is (might be international)
  return cleaned;
}

/**
 * Validate a Ghanaian phone number format.
 * Accepts: 024xxxxxxx, +23324xxxxxxx, 23324xxxxxxx, 24xxxxxxx
 *
 * @returns { valid: boolean, normalized?: string, error?: string }
 */
export function validateGhanaPhone(input: string): { valid: boolean; normalized?: string; error?: string } {
  if (!input) return { valid: true, normalized: "" }; // empty is valid (optional field)

  const normalized = normalizeGhanaPhone(input);

  // After normalization, Ghanaian numbers should be +233 + 9 digits = 13 chars
  if (normalized.startsWith("+233")) {
    if (!/^\+233\d{9}$/.test(normalized)) {
      return {
        valid: false,
        error: "Ghanaian phone must be 9 digits after the +233 prefix (e.g., +233241234567)",
      };
    }
  }

  // International numbers: at least 8 digits
  if (normalized.startsWith("+") && !normalized.startsWith("+233")) {
    if (!/^\+\d{8,15}$/.test(normalized)) {
      return {
        valid: false,
        error: "International phone must be 8–15 digits after the + prefix",
      };
    }
  }

  return { valid: true, normalized };
}
