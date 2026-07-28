import { NextResponse } from "next/server";
import {
  getServerAuthClient,
  getSupabaseAdmin,
  isServerAuthConfigured,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CommissionerUser = {
  id: string;
};

type AuthorizationResult =
  | { user: CommissionerUser; response?: never }
  | { user?: never; response: NextResponse };

type BracketRow = {
  id: string;
  user_id: string;
  season_year: number;
  display_name: string;
  is_primary: boolean;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  username: string;
};

type PaymentRow = {
  bracket_id: string;
  is_paid: boolean;
  amount_cents: number;
  payment_method: string | null;
  note: string | null;
  paid_at: string | null;
  marked_by: string | null;
  updated_at: string;
};

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
    return {
      response: jsonError("Please sign in again.", 401),
    };
  }

  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) {
    return {
      response: jsonError("Please sign in again.", 401),
    };
  }

  if (data.user.app_metadata?.role !== "commissioner") {
    return {
      response: jsonError("Commissioner access is required.", 403),
    };
  }

  return { user: { id: data.user.id } };
}

export async function GET(request: Request) {
  if (!isServerAuthConfigured()) {
    return jsonError("Commissioner tools are temporarily unavailable.", 503);
  }

  const authorization = await authorizeCommissioner(request);
  if (authorization.response) return authorization.response;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return jsonError("Commissioner tools are temporarily unavailable.", 503);
  }

  try {
    const [bracketsResult, profilesResult, paymentsResult, usersResult] =
      await Promise.all([
        admin
          .from("brackets")
          .select(
            "id, user_id, season_year, display_name, is_primary, created_at",
          )
          .order("season_year", { ascending: false })
          .order("display_name"),
        admin.from("profiles").select("user_id, username"),
        admin
          .from("bracket_payments")
          .select(
            "bracket_id, is_paid, amount_cents, payment_method, note, paid_at, marked_by, updated_at",
          ),
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);

    if (
      bracketsResult.error ||
      profilesResult.error ||
      paymentsResult.error ||
      usersResult.error
    ) {
      console.error("[commissioner] Payment list failed", {
        brackets: bracketsResult.error?.message,
        profiles: profilesResult.error?.message,
        payments: paymentsResult.error?.message,
        users: usersResult.error?.message,
      });
      return jsonError("Payment information could not be loaded.", 500);
    }

    const profiles = new Map(
      (profilesResult.data as ProfileRow[]).map((profile) => [
        profile.user_id,
        profile.username,
      ]),
    );
    const emails = new Map(
      usersResult.data.users.map((user) => [user.id, user.email ?? null]),
    );
    const payments = new Map(
      (paymentsResult.data as PaymentRow[]).map((payment) => [
        payment.bracket_id,
        payment,
      ]),
    );

    const brackets = (bracketsResult.data as BracketRow[]).map((bracket) => {
      const payment = payments.get(bracket.id);
      return {
        id: bracket.id,
        seasonYear: bracket.season_year,
        displayName: bracket.display_name,
        isPrimary: bracket.is_primary,
        username: profiles.get(bracket.user_id) ?? "unknown",
        email: emails.get(bracket.user_id) ?? null,
        isPaid: payment?.is_paid ?? false,
        amountCents: payment?.amount_cents ?? 1000,
        paymentMethod: payment?.payment_method ?? "",
        note: payment?.note ?? "",
        paidAt: payment?.paid_at ?? null,
        updatedAt: payment?.updated_at ?? null,
      };
    });

    return NextResponse.json(
      { brackets },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("[commissioner] Payment list request failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return jsonError("Payment information could not be loaded.", 500);
  }
}

export async function PATCH(request: Request) {
  if (!isServerAuthConfigured()) {
    return jsonError("Commissioner tools are temporarily unavailable.", 503);
  }

  const authorization = await authorizeCommissioner(request);
  if (authorization.response) return authorization.response;

  let body: {
    bracketId?: unknown;
    isPaid?: unknown;
    amountCents?: unknown;
    paymentMethod?: unknown;
    note?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid payment update.", 400);
  }

  const bracketId =
    typeof body.bracketId === "string" ? body.bracketId.trim() : "";
  const amountCents = body.amountCents;
  const isPaid = body.isPaid;
  const paymentMethod =
    typeof body.paymentMethod === "string"
      ? body.paymentMethod.trim()
      : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (
    !uuidPattern.test(bracketId) ||
    typeof isPaid !== "boolean" ||
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents < 0 ||
    amountCents > 10_000_000 ||
    paymentMethod.length > 50 ||
    note.length > 500
  ) {
    return jsonError("Invalid payment update.", 400);
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return jsonError("Commissioner tools are temporarily unavailable.", 503);
  }

  try {
    const [bracketResult, existingResult] = await Promise.all([
      admin
        .from("brackets")
        .select("id")
        .eq("id", bracketId)
        .maybeSingle(),
      admin
        .from("bracket_payments")
        .select("paid_at")
        .eq("bracket_id", bracketId)
        .maybeSingle(),
    ]);

    if (bracketResult.error || !bracketResult.data) {
      return jsonError("That bracket no longer exists.", 404);
    }
    if (existingResult.error) {
      console.error("[commissioner] Existing payment lookup failed", {
        message: existingResult.error.message,
      });
      return jsonError("Payment information could not be saved.", 500);
    }

    const now = new Date().toISOString();
    const paidAt = isPaid
      ? ((existingResult.data as { paid_at: string | null } | null)?.paid_at ??
        now)
      : null;

    const paymentPayload = {
      bracket_id: bracketId,
      is_paid: isPaid,
      amount_cents: amountCents,
      payment_method: paymentMethod || null,
      note: note || null,
      paid_at: paidAt,
      marked_by: authorization.user.id,
      updated_at: now,
    };

    const { data: savedPaymentData, error } = await admin
      .from("bracket_payments")
      .upsert(
        paymentPayload as never,
        { onConflict: "bracket_id" },
      )
      .select(
        "bracket_id, is_paid, amount_cents, payment_method, note, paid_at, updated_at",
      )
      .single();
    const data = savedPaymentData as Omit<PaymentRow, "marked_by"> | null;

    if (error || !data) {
      console.error("[commissioner] Payment update failed", {
        message: error?.message,
      });
      return jsonError("Payment information could not be saved.", 500);
    }

    return NextResponse.json(
      {
        payment: {
          bracketId: data.bracket_id,
          isPaid: data.is_paid,
          amountCents: data.amount_cents,
          paymentMethod: data.payment_method ?? "",
          note: data.note ?? "",
          paidAt: data.paid_at,
          updatedAt: data.updated_at,
        },
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("[commissioner] Payment update request failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return jsonError("Payment information could not be saved.", 500);
  }
}
