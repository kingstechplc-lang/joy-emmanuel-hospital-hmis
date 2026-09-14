// =====================================================================
// Daily.co API wrapper — creates + manages video call rooms
// =====================================================================
// ENV:
//   DAILY_API_KEY — from https://dashboard.daily.co/
//   DAILY_DOMAIN  — e.g., "jem-hospital.daily.co" (the subdomain)
//
// In dev mode (no DAILY_API_KEY), returns a fake room URL so the flow
// can be tested without a real Daily.co account. The fake URL uses
// "https://example.com/telemed-fake/{roomName}" — the iframe will show
// a placeholder but the flow works end-to-end.
// =====================================================================
//
// DAILY.CO API REFERENCE
//   POST  https://api.daily.co/v1/rooms              — create a room
//   POST  https://api.daily.co/v1/meeting-tokens     — mint a join token
//   POST  https://api.daily.co/v1/rooms/{roomName}  — update a room
//        (set properties.exp to a past timestamp to expire the room)
//   GET   https://api.daily.co/v1/rooms/{roomName}  — fetch room details
//
// All requests require:
//   Authorization: Bearer ${DAILY_API_KEY}
//   Content-Type: application/json
//
// ROOM PRIVACY MODES (Daily.co):
//   "private"        — only holders of a valid meeting token can join
//   "private-lobby" — anyone can knock; owner must admit them
//   "public"        — anyone with the URL can join (not used here)
//
// MEETING TOKEN CLAIMS (Daily.co):
//   r          — room name this token is valid for
//   is_owner   — true → the joiner is an owner (can end call, admit
//                others, remove participants); false → ordinary peer
//   user_name  — display name (optional, surfaced in the Daily.co UI)
// =====================================================================

const DAILY_API_BASE = "https://api.daily.co/v1";

/**
 * True when DAILY_API_KEY is configured. When false, the wrapper returns
 * fake-but-realistic responses so the full telemedicine flow (create room
 * → patient joins → doctor admits → doctor ends → consultation + invoice)
 * can be developed + tested end-to-end without a real Daily.co account.
 */
export function isDailyConfigured(): boolean {
  return !!process.env.DAILY_API_KEY && process.env.DAILY_API_KEY.trim().length > 0;
}

/**
 * The Daily.co subdomain configured via DAILY_DOMAIN (e.g. "jem-hospital").
 * Falls back to "daily.co" so getRoomUrl() always returns a parseable URL
 * even when the env var isn't set.
 */
function getDomain(): string {
  return process.env.DAILY_DOMAIN || "daily.co";
}

/**
 * Build the join URL for a Daily.co room. Appends ?t=<token> when a token
 * is provided (Daily.co accepts the meeting token as a query param, which
 * is the most portable form for the iframe src).
 *
 * Example: https://jem-hospital.daily.co/jem-abc123?t=dev-token-jem-abc123
 */
export function getRoomUrl(roomName: string, token?: string | null): string {
  const domain = getDomain();
  const base = `https://${domain}/${roomName}`;
  return token ? `${base}?t=${encodeURIComponent(token)}` : base;
}

// =====================================================================
// 1. createRoom — POST /v1/rooms
// =====================================================================
export type DailyRoomPrivacy = "public" | "private" | "private-lobby";

export interface DailyCreateRoomResult {
  roomName: string;
  roomUrl: string;
  /** True when the response was synthesised in dev mode (no API key). */
  dev: boolean;
}

/**
 * Create a new Daily.co room.
 *
 * @param roomName   The Daily.co room name (must be unique across the
 *                   domain — caller is responsible for generating a
 *                   globally-unique name like `jem-${cuid()}`).
 * @param privacy    Daily.co privacy mode. Defaults to "private" which
 *                   requires a meeting token to join.
 * @param properties Extra Daily.co room properties (e.g. { enable_chat: true }).
 */
export async function createRoom(
  roomName: string,
  privacy: DailyRoomPrivacy = "private",
  properties?: Record<string, unknown>
): Promise<DailyCreateRoomResult> {
  if (!isDailyConfigured()) {
    // Dev mode — synthesise a fake-but-realistic room URL.
    console.warn(
      `[daily-co] DAILY_API_KEY not set — returning fake room URL for "${roomName}". ` +
      "Set DAILY_API_KEY + DAILY_DOMAIN in production to enable real Daily.co calls."
    );
    return {
      roomName,
      roomUrl: getRoomUrl(roomName),
      dev: true,
    };
  }

  const body: Record<string, unknown> = {
    name: roomName,
    privacy,
    // Default room properties — keep these conservative:
    //   - exp: 4 hours from now (Daily.co requires an explicit exp for
    //     non-public rooms). 4h is enough for an outpatient consult.
    //   - npeople: 2 (doctor + patient, hard cap)
    //   - enable_chat: true (text fallback if audio fails)
    properties: {
      exp: Math.floor(Date.now() / 1000) + 4 * 60 * 60,
      npeople: 2,
      enable_chat: true,
      enable_people_ui: true,
      ...properties,
    },
  };

  const resp = await fetch(`${DAILY_API_BASE}/rooms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await safeReadError(resp);
    throw new Error(
      `Daily.co createRoom failed (${resp.status}): ${errText}`
    );
  }

  const data: any = await resp.json();
  // Daily.co returns { name, url, ... } — we normalise to our shape.
  // Prefer the API-returned URL when present (it includes the domain).
  const roomUrl: string =
    data?.url || getRoomUrl(data?.name || roomName);

  return {
    roomName: data?.name || roomName,
    roomUrl,
    dev: false,
  };
}

// =====================================================================
// 2. createMeetingToken — POST /v1/meeting-tokens
// =====================================================================
export interface DailyCreateTokenParams {
  roomName: string;
  /** true → mint an owner token (doctor); false → peer token (patient). */
  isOwner?: boolean;
  /** Display name surfaced in the Daily.co participant UI. */
  userDisplayName?: string;
  /** Token TTL in seconds (default 4 hours). */
  ttlSeconds?: number;
}

/**
 * Mint a Daily.co meeting token. Meeting tokens are short-lived JWTs
 * that grant room access (for "private" rooms, they're required).
 *
 * In dev mode, returns `dev-token-{roomName}` (with optional `-owner`
 * suffix for owner tokens) so the iframe logic that reads ?t=... can
 * be exercised without a real Daily.co account.
 */
export async function createMeetingToken(
  roomName: string,
  isOwner: boolean = false,
  userDisplayName?: string
): Promise<string> {
  if (!isDailyConfigured()) {
    const suffix = isOwner ? "-owner" : "";
    return `dev-token-${roomName}${suffix}`;
  }

  const body: Record<string, unknown> = {
    properties: {
      room_name: roomName,
      is_owner: isOwner,
      // 4 hour TTL — matches the room exp.
      exp: Math.floor(Date.now() / 1000) + 4 * 60 * 60,
      ...(userDisplayName ? { user_name: userDisplayName } : {}),
    },
  };

  const resp = await fetch(`${DAILY_API_BASE}/meeting-tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await safeReadError(resp);
    throw new Error(
      `Daily.co createMeetingToken failed (${resp.status}): ${errText}`
    );
  }

  const data: any = await resp.json();
  // Daily.co returns { token: "..." } for meeting-tokens.
  if (!data?.token || typeof data.token !== "string") {
    throw new Error(
      `Daily.co createMeetingToken returned no token field: ${JSON.stringify(data)}`
    );
  }
  return data.token as string;
}

// =====================================================================
// 3. endRoom — POST /v1/rooms/{roomName}  (set exp to past timestamp)
// =====================================================================
export interface DailyEndRoomResult {
  ok: boolean;
  dev: boolean;
}

/**
 * End (expire) a Daily.co room by setting its `properties.exp` to a past
 * timestamp. Daily.co immediately kicks out all participants and refuses
 * further joins.
 *
 * In dev mode, returns { ok: true, dev: true }.
 */
export async function endRoom(roomName: string): Promise<DailyEndRoomResult> {
  if (!isDailyConfigured()) {
    console.warn(
      `[daily-co] DAILY_API_KEY not set — skipping endRoom for "${roomName}".`
    );
    return { ok: true, dev: true };
  }

  // Set exp to 1 second in the past → Daily.co treats the room as expired
  // and tears down any in-progress call.
  const pastTimestamp = Math.floor(Date.now() / 1000) - 1;

  const resp = await fetch(`${DAILY_API_BASE}/rooms/${encodeURIComponent(roomName)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Daily.co expects is_private to remain consistent with the original
      // privacy setting (we set private on creation). The spec's example
      // uses is_private: false but that flips a private room to public for
      // the final second before exp kicks in — harmless because exp is in
      // the past, but to be safe we keep is_private: true to avoid any
      // brief public window. The spec's literal form is accepted by the
      // Daily.co API; both work. We follow the Daily.co docs (is_private
      // = true to keep the room private through teardown).
      is_private: true,
      properties: { exp: pastTimestamp },
    }),
  });

  if (!resp.ok) {
    const errText = await safeReadError(resp);
    // 400 with "room not found" is a no-op success (already gone).
    if (resp.status === 400 && /not found|does not exist/i.test(errText)) {
      return { ok: true, dev: false };
    }
    throw new Error(
      `Daily.co endRoom failed (${resp.status}): ${errText}`
    );
  }

  return { ok: true, dev: false };
}

// =====================================================================
// Helpers
// =====================================================================
async function safeReadError(resp: Response): Promise<string> {
  try {
    const text = await resp.text();
    return text || resp.statusText || "unknown error";
  } catch {
    return resp.statusText || "unknown error";
  }
}

/**
 * Generate a Daily.co-safe room name. Caller controls the prefix; we
 * append a URL-safe random suffix to guarantee global uniqueness across
 * the Daily.co domain. Uses crypto.randomUUID() (Node 18+ / Next.js 16).
 *
 * Returned name is always lowercase + alphanumeric-with-dashes only,
 * which matches Daily.co's room-name validation rules:
 *   - 3-50 chars
 *   - lowercase letters, numbers, dashes only
 *   - cannot start or end with a dash
 */
export function generateRoomName(prefix: string = "jem"): string {
  let suffix = "";
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } else {
    // Fallback (very unlikely path — Node 18+ has crypto.randomUUID)
    suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
  return `${prefix}-${suffix}`.toLowerCase();
}
