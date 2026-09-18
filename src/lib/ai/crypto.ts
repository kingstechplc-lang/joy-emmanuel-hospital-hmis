// =====================================================================
// AI CREDENTIAL ENCRYPTION — AES-256-GCM
// =====================================================================
// API keys are encrypted before storing in the database and decrypted
// only server-side at runtime. The encryption key is derived from
// NEXTAUTH_SECRET (already set on Vercel) using PBKDF2 with a fixed
// salt. This means:
//   - API keys are NEVER stored in plaintext in the database
//   - API keys are NEVER returned in API responses
//   - Decryption only happens server-side in the AI service
//   - If NEXTAUTH_SECRET changes, all stored credentials become
//     undecryptable (which is the correct security behavior)
// =====================================================================
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_DERIVATION_SALT = "jem-hmis-ai-credential-encryption-v1";
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits

function getEncryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET || "joy-emmanuel-hospital-dev-secret-change-in-production";
  return crypto.pbkdf2Sync(secret, KEY_DERIVATION_SALT, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

export interface EncryptedCredential {
  encrypted: string; // base64 ciphertext
  iv: string;   // base64 initialization vector
  tag: string;  // base64 auth tag
}

export function encryptApiKey(plaintext: string): EncryptedCredential {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptApiKey(encrypted: string, iv: string, tag: string): string | null {
  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (e) {
    console.error("[AI Crypto] decryption failed:", e);
    return null;
  }
}

/**
 * Mask an API key for display — shows first 6 + last 4 chars.
 * NEVER returns the full key.
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 10) return "Configured";
  return `${key.slice(0, 6)}...${key.slice(-4)} (len=${key.length})`;
}
