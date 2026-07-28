"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CircleDollarSign,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "./commissioner.module.css";

type CommissionerBracket = {
  id: string;
  seasonYear: number;
  displayName: string;
  isPrimary: boolean;
  username: string;
  email: string | null;
  isPaid: boolean;
  amountCents: number;
  paymentMethod: string;
  note: string;
  paidAt: string | null;
  updatedAt: string | null;
};

type PaymentDraft = {
  isPaid: boolean;
  amount: string;
  paymentMethod: string;
  note: string;
};

type PaymentFilter = "all" | "paid" | "unpaid";

function draftFromBracket(bracket: CommissionerBracket): PaymentDraft {
  return {
    isPaid: bracket.isPaid,
    amount: (bracket.amountCents / 100).toFixed(2),
    paymentMethod: bracket.paymentMethod,
    note: bracket.note,
  };
}

function paidDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function CommissionerPage() {
  const router = useRouter();
  const [brackets, setBrackets] = useState<CommissionerBracket[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PaymentDraft>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const accessToken = useCallback(async () => {
    const client = supabase;
    if (!client) return null;

    const refreshResult = await client.auth.refreshSession();
    if (refreshResult.data.session?.access_token) {
      return refreshResult.data.session.access_token;
    }

    const sessionResult = await client.auth.getSession();
    return sessionResult.data.session?.access_token ?? null;
  }, []);

  const loadPayments = useCallback(
    async (isRefresh = false) => {
      const client = supabase;
      if (!client) {
        router.replace("/");
        return;
      }

      if (isRefresh) setRefreshing(true);
      setError("");

      try {
        const token = await accessToken();
        if (!token) {
          router.replace("/");
          return;
        }

        const response = await fetch("/api/commissioner/payments", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          brackets?: CommissionerBracket[];
          error?: string;
        };

        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (response.status === 403) {
          setForbidden(true);
          return;
        }
        if (!response.ok || !payload.brackets) {
          throw new Error(payload.error || "Payment information could not be loaded.");
        }

        setForbidden(false);
        setBrackets(payload.brackets);
        setDrafts(
          Object.fromEntries(
            payload.brackets.map((bracket) => [
              bracket.id,
              draftFromBracket(bracket),
            ]),
          ),
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Payment information could not be loaded.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, router],
  );

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadPayments(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadPayments]);

  const summary = useMemo(() => {
    const paid = brackets.filter((bracket) => bracket.isPaid).length;
    return {
      total: brackets.length,
      paid,
      unpaid: brackets.length - paid,
    };
  }, [brackets]);

  const visibleBrackets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return brackets.filter((bracket) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "paid" && bracket.isPaid) ||
        (filter === "unpaid" && !bracket.isPaid);
      const matchesQuery =
        !normalizedQuery ||
        bracket.displayName.toLowerCase().includes(normalizedQuery) ||
        bracket.username.toLowerCase().includes(normalizedQuery) ||
        bracket.email?.toLowerCase().includes(normalizedQuery);
      return matchesFilter && Boolean(matchesQuery);
    });
  }, [brackets, filter, query]);

  function updateDraft(
    bracketId: string,
    field: keyof PaymentDraft,
    value: string | boolean,
  ) {
    setDrafts((current) => ({
      ...current,
      [bracketId]: {
        ...current[bracketId],
        [field]: value,
      },
    }));
    setSavedId(null);
  }

  async function savePayment(bracketId: string) {
    const draft = drafts[bracketId];
    if (!draft) return;

    if (!/^\d+(?:\.\d{1,2})?$/.test(draft.amount)) {
      setError("Enter the payment amount using dollars and cents.");
      return;
    }

    const amountCents = Math.round(Number(draft.amount) * 100);
    setSavingId(bracketId);
    setSavedId(null);
    setError("");

    try {
      const token = await accessToken();
      if (!token) {
        router.replace("/");
        return;
      }

      const response = await fetch("/api/commissioner/payments", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bracketId,
          isPaid: draft.isPaid,
          amountCents,
          paymentMethod: draft.paymentMethod,
          note: draft.note,
        }),
      });
      const payload = (await response.json()) as {
        payment?: {
          bracketId: string;
          isPaid: boolean;
          amountCents: number;
          paymentMethod: string;
          note: string;
          paidAt: string | null;
          updatedAt: string;
        };
        error?: string;
      };

      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok || !payload.payment) {
        throw new Error(payload.error || "Payment information could not be saved.");
      }

      const payment = payload.payment;
      setBrackets((current) =>
        current.map((bracket) =>
          bracket.id === bracketId
            ? {
                ...bracket,
                isPaid: payment.isPaid,
                amountCents: payment.amountCents,
                paymentMethod: payment.paymentMethod,
                note: payment.note,
                paidAt: payment.paidAt,
                updatedAt: payment.updatedAt,
              }
            : bracket,
        ),
      );
      setDrafts((current) => ({
        ...current,
        [bracketId]: {
          isPaid: payment.isPaid,
          amount: (payment.amountCents / 100).toFixed(2),
          paymentMethod: payment.paymentMethod,
          note: payment.note,
        },
      }));
      setSavedId(bracketId);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Payment information could not be saved.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <LoaderCircle className={styles.spinner} size={30} />
        <span>Opening commissioner tools…</span>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className={styles.loading}>
        <ShieldCheck size={42} />
        <strong>Commissioner access required</strong>
        <span>This screen is only available to the ZMM commissioner.</span>
        <Link href="/march-madness">Return to the tournament</Link>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Image
          src="/zmm-logo.png"
          alt="Zerona March Madness"
          width={855}
          height={483}
          priority
        />
        <div className={styles.headerActions}>
          <Link href="/march-madness">
            <ArrowLeft size={16} aria-hidden="true" />
            Tournament
          </Link>
          <button type="button" onClick={signOut}>
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <span>COMMISSIONER</span>
          <h1>Bracket payments</h1>
          <p>Record payment status and private collection notes for each bracket.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadPayments(true)}
          disabled={refreshing}
        >
          <RefreshCw
            className={refreshing ? styles.spinner : undefined}
            size={17}
            aria-hidden="true"
          />
          Refresh
        </button>
      </section>

      <section className={styles.summary} aria-label="Payment summary">
        <div>
          <Users size={21} aria-hidden="true" />
          <span>Total brackets</span>
          <strong>{summary.total}</strong>
        </div>
        <div className={styles.paidSummary}>
          <CircleDollarSign size={21} aria-hidden="true" />
          <span>Paid</span>
          <strong>{summary.paid}</strong>
        </div>
        <div className={styles.unpaidSummary}>
          <WalletCards size={21} aria-hidden="true" />
          <span>Unpaid</span>
          <strong>{summary.unpaid}</strong>
        </div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <span className={styles.srOnly}>Search brackets</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search bracket, username, or email"
            />
          </label>
          <div className={styles.filters} aria-label="Filter payment status">
            {(["all", "unpaid", "paid"] as PaymentFilter[]).map((option) => (
              <button
                type="button"
                className={filter === option ? styles.activeFilter : undefined}
                onClick={() => setFilter(option)}
                aria-pressed={filter === option}
                key={option}
              >
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.list}>
          {visibleBrackets.map((bracket) => {
            const draft = drafts[bracket.id] ?? draftFromBracket(bracket);
            const saving = savingId === bracket.id;
            const saved = savedId === bracket.id;

            return (
              <article
                className={`${styles.paymentRow} ${
                  bracket.isPaid ? styles.paidRow : ""
                }`}
                key={bracket.id}
              >
                <div className={styles.bracketIdentity}>
                  <span>{bracket.seasonYear}</span>
                  <strong>{bracket.displayName}</strong>
                  {bracket.isPrimary && <small>Primary bracket</small>}
                </div>

                <div className={styles.account}>
                  <strong>@{bracket.username}</strong>
                  <span>{bracket.email ?? "No account email"}</span>
                </div>

                <label className={styles.paidToggle}>
                  <input
                    type="checkbox"
                    checked={draft.isPaid}
                    onChange={(event) =>
                      updateDraft(bracket.id, "isPaid", event.target.checked)
                    }
                  />
                  <span>{draft.isPaid ? "Paid" : "Unpaid"}</span>
                  {bracket.isPaid && bracket.paidAt && (
                    <small>{paidDate(bracket.paidAt)}</small>
                  )}
                </label>

                <label className={styles.field}>
                  <span>Amount</span>
                  <div className={styles.moneyInput}>
                    <i>$</i>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.amount}
                      onChange={(event) =>
                        updateDraft(bracket.id, "amount", event.target.value)
                      }
                      aria-label={`Payment amount for ${bracket.displayName}`}
                    />
                  </div>
                </label>

                <label className={styles.field}>
                  <span>Method</span>
                  <input
                    type="text"
                    list="payment-methods"
                    maxLength={50}
                    value={draft.paymentMethod}
                    onChange={(event) =>
                      updateDraft(
                        bracket.id,
                        "paymentMethod",
                        event.target.value,
                      )
                    }
                    placeholder="Venmo, cash…"
                  />
                </label>

                <label className={`${styles.field} ${styles.noteField}`}>
                  <span>Private note</span>
                  <input
                    type="text"
                    maxLength={500}
                    value={draft.note}
                    onChange={(event) =>
                      updateDraft(bracket.id, "note", event.target.value)
                    }
                    placeholder="Optional collection note"
                  />
                </label>

                <button
                  type="button"
                  className={`${styles.saveButton} ${
                    saved ? styles.savedButton : ""
                  }`}
                  onClick={() => void savePayment(bracket.id)}
                  disabled={saving}
                  aria-label={`Save payment for ${bracket.displayName}`}
                >
                  {saving ? (
                    <LoaderCircle
                      className={styles.spinner}
                      size={17}
                      aria-hidden="true"
                    />
                  ) : saved ? (
                    <Check size={18} aria-hidden="true" />
                  ) : (
                    <Save size={17} aria-hidden="true" />
                  )}
                  {saving ? "Saving" : saved ? "Saved" : "Save"}
                </button>
              </article>
            );
          })}

          {visibleBrackets.length === 0 && (
            <div className={styles.empty}>
              <strong>No brackets match that filter.</strong>
              <span>Try another search or payment status.</span>
            </div>
          )}
        </div>
      </section>

      <datalist id="payment-methods">
        <option value="Venmo" />
        <option value="Zelle" />
        <option value="Cash" />
        <option value="Check" />
        <option value="PayPal" />
      </datalist>
    </main>
  );
}
