// =====================================================================
// PATIENT PORTAL — client-side fetch helpers
// =====================================================================
// Wraps fetch() to automatically attach the Bearer token from
// localStorage and handle 401 (expired token) by redirecting to
// /portal/login.
// =====================================================================
const TOKEN_KEY = "patientPortalToken";

export function getPortalToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearPortalToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("patientPortalPhone");
}

export async function portalFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getPortalToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  // Auto-handle 401 — token expired or invalid
  if (res.status === 401 && typeof window !== "undefined") {
    clearPortalToken();
    // Redirect to login
    window.location.href = "/portal/login";
    return res;
  }
  return res;
}

export async function portalFetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await portalFetch(url, init);
  if (!res.ok) {
    let msg = `Failed (${res.status})`;
    try {
      const json = await res.json();
      msg = json.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export async function portalLogout(): Promise<void> {
  try {
    await portalFetch("/api/portal/auth/logout", { method: "POST" });
  } catch { /* ignore — logout is best-effort */ }
  clearPortalToken();
  if (typeof window !== "undefined") {
    window.location.href = "/portal/login";
  }
}
