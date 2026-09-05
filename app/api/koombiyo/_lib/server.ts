import { createClient } from "@supabase/supabase-js";

const API_BASE = (process.env.KOOMBIYO_API_BASE_URL || "").replace(/\/+$/, "");
const API_KEY = process.env.KOOMBIYO_API_KEY || "";
const API_PASSWORD = process.env.KOOMBIYO_API_PASSWORD || "";

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

async function login() {
  requiredEnv();

  const res = await fetch(`${API_BASE}/auth_login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ api_key: API_KEY, password: API_PASSWORD }),
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.accessToken) {
    throw new Error(json?.message || `Koombiyo login failed (${res.status})`);
  }

  return String(json.data.accessToken);
}

export async function koombiyoJson(path: string, body?: unknown) {
  const token = await login();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(json?.message || `Koombiyo request failed (${res.status})`);
  }

  return json;
}

export async function koombiyoPdf(path: string, body: unknown) {
  const token = await login();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/pdf",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.message || `Koombiyo PDF request failed (${res.status})`);
  }

  return res.arrayBuffer();
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown server error";

  if (message === "HAMAKI_UNAUTHORIZED") {
    return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  console.error("KOOMBIYO API ERROR:", error);
  return Response.json({ ok: false, message }, { status: 500 });
}
