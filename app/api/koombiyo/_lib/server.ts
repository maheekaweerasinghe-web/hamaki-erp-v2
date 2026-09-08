import { createClient } from "@supabase/supabase-js";

const API_BASE = (process.env.KOOMBIYO_API_BASE_URL || "").replace(/\/+$/, "");
const API_KEY = process.env.KOOMBIYO_API_KEY || "";
const API_PASSWORD = process.env.KOOMBIYO_API_PASSWORD || "";

let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;
let loginPromise: Promise<string> | null = null;

function requiredEnv() {
  if (!API_BASE || !API_KEY || !API_PASSWORD) {
    throw new Error("Koombiyo environment variables are not configured.");
  }
}

export async function requireHamakiUser(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("HAMAKI_UNAUTHORIZED");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !anon) throw new Error("Supabase environment variables are missing.");

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) throw new Error("HAMAKI_UNAUTHORIZED");

  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("id,email,full_name,role,sales_code,is_active,auth_user_id")
    .eq("auth_user_id", authData.user.id)
    .eq("is_active", true)
    .single();

  if (appUserError || !appUser) throw new Error("HAMAKI_UNAUTHORIZED");

  return { supabase, appUser, accessToken: token };
}

function jwtExpiryMs(token: string) {
  try {
    const part = token.split(".")[1];
    if (!part) return 0;

    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));

    const exp = Number(payload?.exp || 0);
    return exp > 0 ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function freshLogin() {
  requiredEnv();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${API_BASE}/auth_login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ api_key: API_KEY, password: API_PASSWORD }),
      cache: "no-store",
      signal: controller.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.data?.accessToken) {
      throw new Error(json?.message || `Koombiyo login failed (${res.status})`);
    }

    const token = String(json.data.accessToken);
    const jwtExpiry = jwtExpiryMs(token);

    cachedAccessToken = token;

    // Prefer JWT expiry when available. Otherwise keep a conservative
    // warm-instance cache for 10 minutes.
    cachedAccessTokenExpiresAt =
      jwtExpiry > Date.now()
        ? jwtExpiry
        : Date.now() + 10 * 60 * 1000;

    return token;
  } finally {
    clearTimeout(timeout);
  }
}

async function login(forceRefresh = false) {
  if (
    !forceRefresh &&
    cachedAccessToken &&
    Date.now() < cachedAccessTokenExpiresAt - 90_000
  ) {
    return cachedAccessToken;
  }

  if (!loginPromise) {
    loginPromise = freshLogin().finally(() => {
      loginPromise = null;
    });
  }

  return loginPromise;
}

async function koombiyoFetch(
  path: string,
  body: unknown,
  accept: string,
  forceFreshToken = false
) {
  const token = await login(forceFreshToken);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    return await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: accept,
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function koombiyoJson(path: string, body?: unknown) {
  let res = await koombiyoFetch(path, body, "application/json");

  // If Koombiyo invalidated the cached token early, refresh once.
  if (res.status === 401) {
    cachedAccessToken = "";
    cachedAccessTokenExpiresAt = 0;
    res = await koombiyoFetch(path, body, "application/json", true);
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(json?.message || `Koombiyo request failed (${res.status})`);
  }

  return json;
}

export async function koombiyoPdf(path: string, body: unknown) {
  let res = await koombiyoFetch(path, body, "application/pdf");

  if (res.status === 401) {
    cachedAccessToken = "";
    cachedAccessTokenExpiresAt = 0;
    res = await koombiyoFetch(path, body, "application/pdf", true);
  }

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.message || `Koombiyo PDF request failed (${res.status})`);
  }

  return res.arrayBuffer();
}

export function apiError(error: unknown) {
  let message = error instanceof Error ? error.message : "Unknown server error";

  if (message === "HAMAKI_UNAUTHORIZED") {
    return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (/aborted|aborterror/i.test(message)) {
    message = "Koombiyo took too long to respond. Please try again once.";
  }

  console.error("KOOMBIYO API ERROR:", error);
  return Response.json({ ok: false, message }, { status: 500 });
}
