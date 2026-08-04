import { NextResponse } from "next/server";
import {
  getServerAuthClient,
  invokeSecretEdgeFunction,
  isServerAuthConfigured,
} from "@/lib/supabase-server";
import { isCommissionerUser } from "@/lib/commissioner";

export const runtime = "nodejs";
export const maxDuration = 300;

const noStoreHeaders = { "Cache-Control": "no-store" };

type CommissionerUser = {
  id: string;
};

type AuthorizationResult =
  | { user: CommissionerUser; response?: never }
  | { user?: never; response: NextResponse };

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: noStoreHeaders },
  );
}

async function authorizeCommissioner(
  request: Request,
): Promise<AuthorizationResult> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  const auth = getServerAuthClient();

  if (!token || !auth) {
    return { response: jsonError("Please sign in again.", 401) };
  }

  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) {
    return { response: jsonError("Please sign in again.", 401) };
  }
  if (!isCommissionerUser(data.user)) {
    return {
      response: jsonError("Commissioner access is required.", 403),
    };
  }
  return { user: { id: data.user.id } };
}

async function invokeLaunch(
  body: Record<string, unknown>,
) {
  try {
    const { response, payload } = await invokeSecretEdgeFunction<
      Record<string, unknown>
    >("manage-tournament-launch", body);
    return NextResponse.json(payload, {
      status: response.status,
      headers: noStoreHeaders,
    });
  } catch (error) {
    console.error("[commissioner] Tournament launch request failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return jsonError("Tournament email tools are temporarily unavailable.", 503);
  }
}

export async function GET(request: Request) {
  if (!isServerAuthConfigured()) {
    return jsonError("Commissioner tools are temporarily unavailable.", 503);
  }
  const authorization = await authorizeCommissioner(request);
  if (authorization.response) return authorization.response;
  return invokeLaunch({ mode: "status" });
}

export async function POST(request: Request) {
  if (!isServerAuthConfigured()) {
    return jsonError("Commissioner tools are temporarily unavailable.", 503);
  }
  const authorization = await authorizeCommissioner(request);
  if (authorization.response) return authorization.response;
  return invokeLaunch({
    mode: "send",
    approvedBy: authorization.user.id,
  });
}
