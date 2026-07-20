import { NextResponse } from "next/server";
import {
  getServerAuthClient,
  isServerAuthConfigured,
  resolveEmailForIdentifier,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };
const genericResponse = {
  message: "If that account exists, a reset link will be sent.",
};

export async function POST(request: Request) {
  if (!isServerAuthConfigured()) {
    return NextResponse.json(
      { error: "Password recovery is temporarily unavailable." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  let body: { username?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(genericResponse, { headers: noStoreHeaders });
  }

  const username =
    typeof body.username === "string" ? body.username.trim() : "";

  if (!username || username.length > 254) {
    return NextResponse.json(genericResponse, { headers: noStoreHeaders });
  }

  try {
    const email = await resolveEmailForIdentifier(username);
    const auth = getServerAuthClient();

    if (email && auth) {
      const redirectTo = `${new URL(request.url).origin}/reset-password`;
      const { error } = await auth.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        console.error("[auth] Recovery email request failed", {
          message: error.message,
        });
      }
    }
  } catch (error) {
    console.error("[auth] Recovery lookup failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // Always use the same response so this endpoint does not reveal usernames.
  return NextResponse.json(genericResponse, { headers: noStoreHeaders });
}
