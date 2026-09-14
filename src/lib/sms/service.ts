// =====================================================================
// SMS SERVICE — pluggable interface + factory
// =====================================================================
// The patient portal sends one-time passwords (OTPs) to patients via SMS.
// We don't yet have a real SMS gateway (Hubtel / Mnotify / Twilio — that
// arrives in Tier 3 #8 SMS Notifications). Until then, we use a dev-mode
// implementation that:
//
//   1. Writes the message body + recipient to the SmsLog table (so the
//      dev dashboard can read it back and display the OTP for testing)
//   2. Logs to console.error with a clear marker, so the OTP appears in
//      the Vercel build logs / server logs during testing
//   3. Returns a fake "providerMessageId" so the caller can't tell the
//      difference
//
// When Tier 3 #8 ships, swap the factory's `default` branch to return a
// real `HubtelSmsService` (or whichever gateway is configured) — zero
// code changes anywhere else in the codebase.
//
// ENV:
//   SMS_PROVIDER     = "dev" | "hubtel" | "mnotify" | "twilio"  (default: "dev")
//   SMS_API_KEY      = gateway-specific API key
//   SMS_SENDER_ID    = registered sender ID (e.g., "JOYEMMH")
// =====================================================================
import { db } from "@/lib/db";

export interface SmsMessage {
  to: string;            // E.164 preferred (e.g., "233241234567")
  body: string;          // plain text, ≤ 480 chars
  relatedOtpId?: string; // if this message carries an OTP
  organizationId?: string;
  ipAddress?: string;
}

export interface SmsSendResult {
  ok: boolean;
  providerMessageId?: string;
  status: "queued" | "sent" | "delivered" | "failed";
  statusDetail?: string;
  /** Dev mode only: the OTP code, surfaced so the dev dashboard /
   *  test harness can read it without checking the DB. Production
   *  gateways never populate this field. */
  devModeOtp?: string;
}

export interface SmsService {
  send(msg: SmsMessage): Promise<SmsSendResult>;
  providerName(): string;
}

// =====================================================================
// DevSmsService — logs to DB + console; never actually sends SMS
// =====================================================================
class DevSmsService implements SmsService {
  providerName() {
    return "dev";
  }

  async send(msg: SmsMessage): Promise<SmsSendResult> {
    try {
      // Persist to SmsLog so the dev dashboard can display "your code is X"
      const log = await db.smsLog.create({
        data: {
          organizationId: msg.organizationId || null,
          toPhone: msg.to,
          fromProvider: "dev",
          messageBody: msg.body,
          providerMessageId: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          status: "sent",
          statusDetail: "Dev mode — message logged to DB + console; no real SMS sent",
          relatedOtpId: msg.relatedOtpId || null,
          ipAddress: msg.ipAddress || null,
        },
      });

      // Try to extract the OTP from the body so we can log it cleanly.
      // Convention: the OTP is the first 6-digit sequence in the message.
      const otpMatch = msg.body.match(/\b(\d{6})\b/);
      const otp = otpMatch ? otpMatch[1] : undefined;

      // Log to console — shows up in `vercel dev` logs and the Vercel
      // dashboard's Functions > Logs view. Use a clear marker so it's
      // easy to grep.
      console.log(
        `\n[DEV SMS] to=${msg.to} otp=${otp || "?"} relatedOtpId=${msg.relatedOtpId || "-"}\n` +
        `  body: "${msg.body}"\n` +
        `  smsLogId: ${log.id}\n`
      );

      return {
        ok: true,
        providerMessageId: log.providerMessageId || undefined,
        status: "sent",
        statusDetail: "Dev mode — see console or /api/portal/dev/sms-log",
        devModeOtp: otp,
      };
    } catch (e: any) {
      console.error("[DEV SMS] failed to log:", e);
      return {
        ok: false,
        status: "failed",
        statusDetail: e?.message || "Dev SMS logging failed",
      };
    }
  }
}

// =====================================================================
// Factory — returns the configured provider
// =====================================================================
let _instance: SmsService | null = null;

export function getSmsService(): SmsService {
  if (_instance) return _instance;
  const provider = (process.env.SMS_PROVIDER || "dev").toLowerCase();
  switch (provider) {
    case "hubtel":
    case "mnotify":
    case "twilio":
      // Tier 3 #8 will wire these up. Until then, fall through to dev
      // with a warning so production deployments with a misconfigured
      // provider don't silently break OTP delivery.
      console.warn(
        `[SMS] Provider "${provider}" not yet implemented — falling back to dev mode. ` +
        `This is expected until Tier 3 #8 ships.`
      );
      _instance = new DevSmsService();
      return _instance;
    case "dev":
    default:
      _instance = new DevSmsService();
      return _instance;
  }
}

/** Test-only: override the singleton. Used by unit tests to inject a mock. */
export function _setSmsServiceForTesting(svc: SmsService | null) {
  _instance = svc;
}
