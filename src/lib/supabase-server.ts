import "server-only";

import { createClient } from "@supabase/supabase-js";

let adminClient: ReturnType<typeof createClient> | null = null;
let authClient: ReturnType<typeof createClient> | null = null;

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getPublishableKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

function getSecretKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function isServerAuthConfigured() {
  return Boolean(getSupabaseUrl() && getPublishableKey() && getSecretKey());
}

export function getSupabaseAdmin() {
  const supabaseUrl = getSupabaseUrl();
  const secretKey = getSecretKey();

  if (!supabaseUrl || !secretKey) return null;

  if (!adminClient) {
    adminClient = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  return adminClient;
}

export function getServerAuthClient() {
  const supabaseUrl = getSupabaseUrl();
  const publishableKey = getPublishableKey();

  if (!supabaseUrl || !publishableKey) return null;

  if (!authClient) {
    authClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  return authClient;
}

export async function invokeSecretEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
) {
  const supabaseUrl = getSupabaseUrl();
  const secretKey = getSecretKey();

  if (!supabaseUrl || !secretKey) {
    throw new Error("Server authentication is not configured.");
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: secretKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(240_000),
    },
  );
  const payload = (await response.json()) as T & { error?: string };
  return { response, payload };
}

export async function resolveEmailForIdentifier(identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();

  // Keep email sign-in available as a quiet migration path for existing users.
  if (normalizedIdentifier.includes("@")) return normalizedIdentifier;

  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Server authentication is not configured.");

  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select("user_id")
    .eq("username", normalizedIdentifier)
    .maybeSingle();

  if (profileError) {
    console.error("[auth] Username lookup failed", {
      code: profileError.code,
      message: profileError.message,
    });
    throw new Error("Username lookup is unavailable.");
  }

  const profile = profileData as { user_id: string } | null;
  if (!profile) return null;

  const { data, error: userError } = await admin.auth.admin.getUserById(
    profile.user_id,
  );

  if (userError) {
    console.error("[auth] Auth user lookup failed", {
      message: userError.message,
    });
    throw new Error("User lookup is unavailable.");
  }

  return data.user?.email?.toLowerCase() ?? null;
}
