"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CircleDollarSign,
  Clock3,
  History,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  RefreshCw,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  getTournamentLifecycle,
  TournamentLifecycle,
} from "@/lib/tournament-lifecycle";
import {
  EspnGameRow,
  PickMap,
  TournamentModel,
  TournamentRegionPairingRow,
} from "../bracket/bracket-types";
import { buildTournamentModel, sanitizePicks } from "../bracket/bracket-utils";
import { AccountMenu } from "./account-menu";
import { Leaderboard } from "./leaderboard";
import { MobileTournamentOverview } from "./mobile-tournament-overview";
import { TournamentBracketViewer } from "./tournament-bracket-viewer";
import { TournamentViewSwitcher } from "./view-switcher";
import {
  BracketPaymentStatus,
  PoolBracket,
  PoolProfile,
  TournamentEntry,
  TournamentGame,
} from "./tournament-types";
import {
  buildLeaderboard,
  buildPreTournamentLeaderboard,
} from "./tournament-utils";
import { useMobileTournamentViewport } from "./use-mobile-tournament-viewport";
import styles from "./march-madness.module.css";

const LIVE_REFRESH_DEBOUNCE_MS = 1_000;
const FALLBACK_POLL_MS = 30_000;
const LEADERBOARD_COLLAPSED_KEY = "zmm:leaderboard-collapsed";
const ESPN_GAME_SELECT =
  "espn_event_id, region, round_code, round_number, starts_at, broadcast, status_state, status_description, status_detail, completed, period, clock, home_team_id, home_team_name, home_team_seed, home_score, home_winner, away_team_id, away_team_name, away_team_seed, away_score, away_winner";
const TOURNAMENT_ROUND_CODES = [
  "PLAY_IN",
  "ROUND_OF_64",
  "ROUND_OF_32",
  "SWEET_16",
  "ELITE_8",
  "FINAL_FOUR",
  "CHAMPIONSHIP",
];

type RawBracket = Omit<PoolBracket, "picks"> & { picks: unknown };
type RefreshKind = "dashboard" | "games";
type RefreshRequest = { kind: RefreshKind; initial: boolean };
type MobileTournamentView = "games" | "leaderboard" | "bracket";
type LiveUpdateStatus =
  | "connecting"
  | "connected"
  | "updating"
  | "reconnecting"
  | "offline";

function pickMap(value: unknown): PickMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export default function MarchMadnessPage() {
  const router = useRouter();
  const isMobileTournamentViewport = useMobileTournamentViewport();
  const [userId, setUserId] = useState("");
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [profile, setProfile] = useState<PoolProfile | null>(null);
  const [profiles, setProfiles] = useState<PoolProfile[]>([]);
  const [brackets, setBrackets] = useState<PoolBracket[]>([]);
  const [entries, setEntries] = useState<TournamentEntry[]>([]);
  const [paymentStatuses, setPaymentStatuses] = useState<
    BracketPaymentStatus[]
  >([]);
  const [games, setGames] = useState<TournamentGame[]>([]);
  const [model, setModel] = useState<TournamentModel | null>(null);
  const [lifecycle, setLifecycle] = useState<TournamentLifecycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [leaderboardCollapsed, setLeaderboardCollapsed] = useState(false);
  const [mobileTournamentView, setMobileTournamentView] =
    useState<MobileTournamentView>("games");
  const [liveUpdateStatus, setLiveUpdateStatus] =
    useState<LiveUpdateStatus>("connecting");
  const refreshInFlightRef = useRef(false);
  const pendingRefreshRef = useRef<RefreshRequest | null>(null);
  const liveRefreshTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const seasonYearRef = useRef<number | null>(null);

  useEffect(() => {
    const restorePreference = window.requestAnimationFrame(() => {
      setLeaderboardCollapsed(
        window.localStorage.getItem(LEADERBOARD_COLLAPSED_KEY) === "true",
      );
    });

    return () => window.cancelAnimationFrame(restorePreference);
  }, []);

  function updateLeaderboardCollapsed(collapsed: boolean) {
    setLeaderboardCollapsed(collapsed);
    window.localStorage.setItem(
      LEADERBOARD_COLLAPSED_KEY,
      String(collapsed),
    );
  }

  const fetchDashboard = useCallback(
    async (showPageError: boolean) => {
      const client = supabase;
      if (!client) {
        router.replace("/");
        return false;
      }

      const { data: userData } = await client.auth.getUser();
      if (!userData.user) {
        router.replace("/");
        return false;
      }

      let lifecycle;
      try {
        lifecycle = await getTournamentLifecycle(client);
      } catch (lifecycleError) {
        console.error(
          "[dashboard] Could not load tournament lifecycle",
          lifecycleError,
        );
        if (showPageError && mountedRef.current) {
          setError("Tournament Central is temporarily unavailable.");
        }
        return false;
      }

      const preTournamentMode = lifecycle.phase === "picks_open";
      const activeSeasonYear = preTournamentMode
        ? (lifecycle.configuredSeasonYear ?? lifecycle.seasonYear)
        : (lifecycle.seasonYear ?? lifecycle.configuredSeasonYear);
      if (activeSeasonYear === null) {
        if (showPageError && mountedRef.current) {
          setError("The tournament season is not configured yet.");
        }
        return false;
      }

      seasonYearRef.current = activeSeasonYear;

      const [
        profilesResult,
        entriesResult,
        bracketsResult,
        paymentStatusesResult,
        gamesResult,
        pairingResult,
      ] = await Promise.all([
        client
          .from("profiles")
          .select("user_id, username")
          .order("username"),
        client
          .from("tournament_entries")
          .select(
            "bracket_id, season_year, owner_user_id, display_name, joined_at, updated_at",
          )
          .eq("season_year", activeSeasonYear)
          .order("joined_at")
          .order("bracket_id"),
        client
          .from("brackets")
          .select(
            "id, user_id, season_year, display_name, is_primary, picks, tiebreaker_total, created_at, updated_at",
          )
          .eq("season_year", activeSeasonYear),
        client
          .from("bracket_payments")
          .select("bracket_id, is_paid"),
        client
          .from("espn_games")
          .select(ESPN_GAME_SELECT)
          .eq("season_year", activeSeasonYear)
          .in("round_code", TOURNAMENT_ROUND_CODES),
        client
          .from("tournament_region_pairings")
          .select(
            "season_year, left_top_region, left_bottom_region, right_top_region, right_bottom_region",
          )
          .eq("season_year", activeSeasonYear)
          .maybeSingle(),
      ]);

      if (
        profilesResult.error ||
        entriesResult.error ||
        bracketsResult.error ||
        paymentStatusesResult.error ||
        gamesResult.error ||
        pairingResult.error ||
        !pairingResult.data
      ) {
        console.error("[dashboard] Could not load tournament", {
          profiles: profilesResult.error?.message,
          entries: entriesResult.error?.message,
          brackets: bracketsResult.error?.message,
          paymentStatuses: paymentStatusesResult.error?.message,
          games: gamesResult.error?.message,
          pairing: pairingResult.error?.message,
        });
        if (showPageError && mountedRef.current) {
          setError("Tournament Central is temporarily unavailable.");
        }
        return false;
      }

      const loadedProfiles = profilesResult.data as PoolProfile[];
      const currentProfile = loadedProfiles.find(
        (candidate) => candidate.user_id === userData.user.id,
      );
      if (!currentProfile) {
        router.replace("/accept-invite");
        return false;
      }

      try {
        const loadedGames = gamesResult.data as TournamentGame[];
        const tournament = buildTournamentModel(
          loadedGames as EspnGameRow[],
          activeSeasonYear,
          pairingResult.data as TournamentRegionPairingRow,
        );
        const loadedBrackets = preTournamentMode
          ? []
          : (bracketsResult.data as RawBracket[]).map((bracket) => ({
              ...bracket,
              picks: sanitizePicks(tournament, pickMap(bracket.picks)),
            }));

        if (!mountedRef.current) return false;
        setUserId(userData.user.id);
        setIsCommissioner(
          userData.user.app_metadata?.role === "commissioner",
        );
        setProfile(currentProfile);
        setProfiles(loadedProfiles);
        setEntries(
          preTournamentMode
            ? (entriesResult.data as TournamentEntry[])
            : [],
        );
        setBrackets(loadedBrackets);
        setPaymentStatuses(
          paymentStatusesResult.data as BracketPaymentStatus[],
        );
        setGames(loadedGames);
        setModel(tournament);
        setLifecycle(lifecycle);
        setLastUpdated(new Date());
        setError("");
        return true;
      } catch (loadError) {
        console.error("[dashboard] Tournament model failed", loadError);
        if (showPageError && mountedRef.current) {
          setError("The tournament bracket is not ready yet.");
        }
        return false;
      }
    },
    [router],
  );

  const fetchGames = useCallback(async () => {
    const client = supabase;
    if (!client) return false;

    let lifecycle;
    try {
      lifecycle = await getTournamentLifecycle(client);
    } catch (lifecycleError) {
      console.error(
        "[dashboard] Could not refresh tournament lifecycle",
        lifecycleError,
      );
      return false;
    }

    if (
      lifecycle.phase === "setup" ||
      lifecycle.phase === "picks_open"
    ) {
      return fetchDashboard(false);
    }

    if (
      lifecycle.seasonYear === null ||
      lifecycle.seasonYear !== seasonYearRef.current
    ) {
      return fetchDashboard(false);
    }

    const [gamesResult, pairingResult] = await Promise.all([
      client
        .from("espn_games")
        .select(ESPN_GAME_SELECT)
        .eq("season_year", lifecycle.seasonYear)
        .in("round_code", TOURNAMENT_ROUND_CODES),
      client
        .from("tournament_region_pairings")
        .select(
          "season_year, left_top_region, left_bottom_region, right_top_region, right_bottom_region",
        )
        .eq("season_year", lifecycle.seasonYear)
        .maybeSingle(),
    ]);

    if (gamesResult.error || pairingResult.error || !pairingResult.data) {
      console.error(
        "[dashboard] Could not refresh tournament games",
        gamesResult.error?.message ?? pairingResult.error?.message,
      );
      return false;
    }

    try {
      const loadedGames = gamesResult.data as TournamentGame[];
      const tournament = buildTournamentModel(
        loadedGames as EspnGameRow[],
        lifecycle.seasonYear,
        pairingResult.data as TournamentRegionPairingRow,
      );

      if (!mountedRef.current) return false;
      setGames(loadedGames);
      setModel(tournament);
      setBrackets((currentBrackets) =>
        currentBrackets.map((bracket) => ({
          ...bracket,
          picks: sanitizePicks(tournament, bracket.picks),
        })),
      );
      setLastUpdated(new Date());
      return true;
    } catch (refreshError) {
      console.error("[dashboard] Tournament game refresh failed", refreshError);
      return false;
    }
  }, [fetchDashboard]);

  const requestRefresh = useCallback(
    async (kind: RefreshKind, initial = false) => {
      const request: RefreshRequest = { kind, initial };

      if (refreshInFlightRef.current) {
        const pending = pendingRefreshRef.current;
        if (!pending || kind === "dashboard") {
          pendingRefreshRef.current = request;
        }
        return;
      }

      refreshInFlightRef.current = true;
      let currentRequest: RefreshRequest | null = request;

      if (!initial && mountedRef.current) {
        setRefreshing(true);
        setLiveUpdateStatus("updating");
      }

      try {
        while (currentRequest) {
          const activeRequest = currentRequest;
          pendingRefreshRef.current = null;
          const succeeded =
            activeRequest.kind === "dashboard"
              ? await fetchDashboard(activeRequest.initial)
              : await fetchGames();

          if (mountedRef.current) {
            if (succeeded && !activeRequest.initial) {
              setLiveUpdateStatus("connected");
            } else if (!succeeded && !activeRequest.initial) {
              setLiveUpdateStatus(
                navigator.onLine ? "reconnecting" : "offline",
              );
            }
            if (activeRequest.initial) setLoading(false);
          }

          currentRequest = pendingRefreshRef.current;
        }
      } finally {
        refreshInFlightRef.current = false;
        if (mountedRef.current) setRefreshing(false);
      }
    },
    [fetchDashboard, fetchGames],
  );

  const scheduleGamesRefresh = useCallback(() => {
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    if (liveRefreshTimerRef.current !== null) {
      window.clearTimeout(liveRefreshTimerRef.current);
    }
    liveRefreshTimerRef.current = window.setTimeout(() => {
      liveRefreshTimerRef.current = null;
      void requestRefresh("games");
    }, LIVE_REFRESH_DEBOUNCE_MS);
  }, [requestRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    const initialLoad = window.setTimeout(
      () => void requestRefresh("dashboard", true),
      0,
    );
    const client = supabase;
    if (!client) {
      return () => {
        mountedRef.current = false;
        window.clearTimeout(initialLoad);
      };
    }

    let pollTimer: number | null = null;
    const stopPolling = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    const startPolling = () => {
      if (
        pollTimer === null &&
        document.visibilityState === "visible" &&
        navigator.onLine
      ) {
        pollTimer = window.setInterval(
          () => void requestRefresh("games"),
          FALLBACK_POLL_MS,
        );
      }
    };
    const refreshWhenActive = () => {
      if (document.visibilityState !== "visible") return;
      startPolling();
      scheduleGamesRefresh();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
      } else {
        refreshWhenActive();
      }
    };
    const handleOnline = () => {
      setLiveUpdateStatus("reconnecting");
      refreshWhenActive();
    };
    const handleOffline = () => {
      stopPolling();
      setLiveUpdateStatus("offline");
    };

    const channel = client
      .channel("zmm-tournament-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "espn_games" },
        scheduleGamesRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_entries",
        },
        () => void requestRefresh("dashboard"),
      )
      .subscribe((status) => {
        if (!mountedRef.current) return;
        if (status === "SUBSCRIBED") {
          setLiveUpdateStatus("connected");
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setLiveUpdateStatus(navigator.onLine ? "reconnecting" : "offline");
        }
      });

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshWhenActive);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    startPolling();

    return () => {
      mountedRef.current = false;
      pendingRefreshRef.current = null;
      window.clearTimeout(initialLoad);
      if (liveRefreshTimerRef.current !== null) {
        window.clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refreshWhenActive);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      void client.removeChannel(channel);
    };
  }, [requestRefresh, scheduleGamesRefresh]);

  const preTournamentMode = lifecycle?.phase === "picks_open";
  const displayedGames = useMemo(
    () =>
      preTournamentMode
        ? games
            .filter((game) => game.round_number === 1)
            .map((game) => ({
              ...game,
              status_state: "pre",
              completed: false,
              period: null,
              clock: null,
              home_score: null,
              home_winner: false,
              away_score: null,
              away_winner: false,
            }))
        : games,
    [games, preTournamentMode],
  );
  const leaderboard = useMemo(() => {
    if (!model) {
      return {
        rows: [],
        championshipComplete: false,
        championshipTotal: null,
        pot: 0,
      };
    }

    return preTournamentMode
      ? buildPreTournamentLeaderboard(entries, profiles)
      : buildLeaderboard(model, games, profiles, brackets);
  }, [
    brackets,
    entries,
    games,
    model,
    preTournamentMode,
    profiles,
  ]);
  const paymentStatusByBracket = useMemo(
    () =>
      new Map(
        paymentStatuses.map((status) => [
          status.bracket_id,
          status.is_paid,
        ]),
      ),
    [paymentStatuses],
  );
  const tournamentGames = displayedGames.filter(
    (game) => game.round_number !== null && game.round_number >= 1,
  );
  const allTournamentGames = games.filter(
    (game) => game.round_number !== null && game.round_number >= 1,
  );
  const finalGames = preTournamentMode
    ? 0
    : tournamentGames.filter((game) => game.completed).length;
  const liveGames = preTournamentMode
    ? 0
    : tournamentGames.filter(
        (game) => game.status_state === "in" && !game.completed,
      ).length;
  const upcomingGames = preTournamentMode
    ? allTournamentGames.length
    : tournamentGames.length - finalGames - liveGames;
  const liveStatusLabel: Record<LiveUpdateStatus, string> = {
    connecting: "Connecting live updates\u2026",
    connected: "Live updates connected",
    updating: "Updating scores\u2026",
    reconnecting: "Reconnecting live updates\u2026",
    offline: "Waiting for connection\u2026",
  };
  const liveStatusClass =
    liveUpdateStatus === "connected"
      ? styles.liveConnected
      : liveUpdateStatus === "updating"
        ? styles.liveUpdating
        : styles.liveReconnecting;
  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  function showMobileTournamentView(view: MobileTournamentView) {
    setMobileTournamentView(view);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <LoaderCircle className={styles.spinner} size={30} />
        <span>Opening Tournament Central…</span>
      </main>
    );
  }

  if (error || !profile || !lifecycle || !model) {
    return (
      <main className={styles.loading}>
        <Trophy size={38} />
        <strong>Tournament Central unavailable</strong>
        <span>{error || "Please try again shortly."}</span>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void requestRefresh("dashboard", true);
          }}
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/march-madness" aria-label="Zerona March Madness home">
          <Image
            src="/zmm-logo.png"
            alt="Zerona March Madness"
            width={855}
            height={483}
            priority
          />
        </Link>
        <TournamentViewSwitcher
          activeView="brackets"
          spreadsheetAvailable={!preTournamentMode}
        />
        <div className={styles.headerUserActions}>
          {isCommissioner && (
            <Link
              className={styles.headerCommissionerButton}
              href={{
                pathname: "/commissioner",
                query: { returnTo: "/march-madness" },
              }}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Commissioner
            </Link>
          )}
          <AccountMenu
            profile={profile}
            isCommissioner={isCommissioner}
            commissionerReturnTo="/march-madness"
            commissionerShortcutVisible
            onSignOut={signOut}
          />
        </div>
      </header>

      {isMobileTournamentViewport && (
        <nav
          className={styles.mobileTournamentTabs}
          aria-label="Tournament Central sections"
        >
          {(
            [
              ["games", "Games"],
              ["leaderboard", "Leaderboard"],
              ["bracket", "Bracket"],
            ] as const
          ).map(([view, label]) => (
            <button
              type="button"
              key={view}
              className={
                mobileTournamentView === view
                  ? styles.mobileTournamentTabActive
                  : ""
              }
              onClick={() => showMobileTournamentView(view)}
              aria-current={
                mobileTournamentView === view ? "page" : undefined
              }
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      <section className={styles.hero} id="top">
        <div>
          <h1>
            Welcome back, <em>@{profile.username}</em>.
          </h1>
        </div>
        <div className={styles.heroActions}>
          {preTournamentMode && (
            <Link className={styles.historyAction} href="/bracket">
              <ArrowLeft size={17} aria-hidden="true" />
              Back to create bracket
            </Link>
          )}
          <Link className={styles.historyAction} href="/history">
            <History size={17} aria-hidden="true" />
            Previous years
          </Link>
        </div>
      </section>

      <section className={styles.summaryGrid} aria-label="Tournament summary">
        <article>
          <Trophy size={19} />
          <span>Games final</span>
          <strong>{finalGames}</strong>
        </article>
        <article className={liveGames > 0 ? styles.liveSummary : ""}>
          <Radio size={19} />
          <span>Live now</span>
          <strong>{liveGames}</strong>
        </article>
        <article>
          <Clock3 size={19} />
          <span>Upcoming</span>
          <strong>{upcomingGames}</strong>
        </article>
        <article>
          <CircleDollarSign size={19} />
          <span>Prize pool</span>
          <strong>${leaderboard.pot.toFixed(0)}</strong>
        </article>
      </section>

      <section
        className={`${styles.tournamentWorkspace} ${
          leaderboardCollapsed ? styles.tournamentWorkspaceCollapsed : ""
        } ${
          mobileTournamentView === "games"
            ? styles.mobileGamesActive
            : mobileTournamentView === "leaderboard"
              ? styles.mobileLeaderboardActive
              : styles.mobileBracketActive
        }`}
        aria-label="Tournament brackets and family standings"
      >
        {isMobileTournamentViewport && (
          <div className={styles.mobileGamesPane} id="mobile-games">
            <MobileTournamentOverview
              model={model}
              games={displayedGames}
              leaderboardRows={leaderboard.rows}
              currentUserId={userId}
              paymentStatusByBracket={paymentStatusByBracket}
              lastUpdated={lastUpdated}
              liveStatusLabel={liveStatusLabel[liveUpdateStatus]}
              liveUpdateStatus={liveUpdateStatus}
              refreshing={refreshing}
              onRefresh={() => void requestRefresh("dashboard")}
              onViewLeaderboard={() =>
                showMobileTournamentView("leaderboard")
              }
            />
          </div>
        )}
        <div className={styles.bracketPane} id="brackets">
          {leaderboardCollapsed && (
            <div className={styles.showLeaderboardBar}>
              <button
                type="button"
                onClick={() => updateLeaderboardCollapsed(false)}
                aria-expanded="false"
                aria-controls="leaderboard"
              >
                <PanelRightOpen size={16} aria-hidden="true" />
                Show leaderboard
              </button>
            </div>
          )}
          <TournamentBracketViewer
            model={model}
            games={displayedGames}
            brackets={brackets}
            currentUserId={userId}
            leaderboardRows={leaderboard.rows}
            masterOnly={preTournamentMode}
          />
        </div>

        <aside
          className={`${styles.leaderboardPane} ${
            leaderboardCollapsed ? styles.leaderboardPaneCollapsed : ""
          }`}
          id="leaderboard"
        >
          <div className={styles.leaderboardSidebarHeading}>
            <div>
              <span>FAMILY STANDINGS</span>
              <h2>Leaderboard</h2>
            </div>
            <div className={styles.updated}>
              <div className={styles.updateDetails}>
                <span
                  className={`${styles.liveStatus} ${liveStatusClass}`}
                  role="status"
                  aria-live="polite"
                >
                  <i aria-hidden="true" />
                  {liveStatusLabel[liveUpdateStatus]}
                </span>
                {lastUpdated && (
                  <span className={styles.updatedAt}>
                    Updated{" "}
                    {lastUpdated.toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
              <div className={styles.leaderboardActions}>
                <button
                  type="button"
                  className={styles.leaderboardRefreshButton}
                  onClick={() => void requestRefresh("dashboard")}
                  disabled={refreshing}
                  aria-label="Refresh tournament data"
                >
                  <RefreshCw
                    className={refreshing ? styles.spinner : ""}
                    size={15}
                  />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateLeaderboardCollapsed(true)}
                  aria-expanded="true"
                  aria-controls="leaderboard"
                  aria-label="Minimize leaderboard"
                >
                  <PanelRightClose size={15} aria-hidden="true" />
                  Hide
                </button>
              </div>
            </div>
          </div>
          <Leaderboard
            rows={leaderboard.rows}
            currentUserId={userId}
            seasonYear={model.seasonYear}
            hidePrivatePicks={preTournamentMode}
            paymentStatusByBracket={paymentStatusByBracket}
          />
          <p className={styles.payoutNote}>
          $10 buy-in · First place 60% · Second place 30% · Third place 10%.
          {leaderboard.championshipComplete
            ? " Final ties are ordered by championship tiebreaker distance."
            : " Current ties split the combined payouts for their occupied places and are ordered by possible points remaining, then bracket creation time."}
          </p>
        </aside>
      </section>
    </main>
  );
}
