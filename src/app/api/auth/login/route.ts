import { NextResponse } from "next/server";
import {
  getServerAuthClient,
  isServerAuthConfigured,
  resolveEmailForIdentifier,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!isServerAuthConfigured()) {
    return NextResponse.json(
      { error: "Sign in is temporarily unavailable." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  let body: { username?: unknown; password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const username =
    typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || username.length > 254 || !password || password.length > 1024) {
    return NextResponse.json(
      { error: "Invalid credentials." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  try {
    const email = await resolveEmailForIdentifier(username);
    const auth = getServerAuthClient();

    if (!email || !auth) {
      return NextResponse.json(
        { error: "Invalid credentials." },
        { status: 401, headers: noStoreHeaders },
      );
    }

    const { data, error } = await auth.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return NextResponse.json(
        { error: "Invalid credentials." },
        { status: 401, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("[auth] Sign-in request failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Sign in is temporarily unavailable." },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
