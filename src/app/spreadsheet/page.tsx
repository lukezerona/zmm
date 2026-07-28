"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudRain, LoaderCircle, RefreshCw, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getTournamentLifecycle } from "@/lib/tournament-lifecycle";
import {
  BracketEntry,
  BracketMatchup,
  DerivedBracket,
  EspnGameRow,
  PickMap,
  REGIONS,
  TournamentModel,
  TournamentRegionPairingRow,
} from "../bracket/bracket-types";
import {
  buildTournamentModel,
  deriveBracket,
  sanitizePicks,
} from "../bracket/bracket-utils";
import { AccountMenu } from "../march-madness/account-menu";
import headerStyles from "../march-madness/march-madness.module.css";
import {
  PoolBracket,
  PoolProfile,
  TournamentGame,
} from "../march-madness/tournament-types";
import {
  buildActualResults,
  buildLeaderboard,
  buildMasterGameIndex,
  buildProjectedLeaderboard,
  buildProjectedPicks,
  ROUND_POINTS,
} from "../march-madness/tournament-utils";
import {
  buildMasterTeamOrder,
  MasterGameCard,
} from "../march-madness/tournament-bracket-canvas";
import { TournamentViewSwitcher } from "../march-madness/view-switcher";
import { buildSpreadsheetPickGroups } from "./spreadsheet-order";
import styles from "./spreadsheet.module.css";

const POLL_INTERVAL_MS = 30_000;
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

function pickMap(value: unknown): PickMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function entryIndex(model: TournamentModel) {
  const entries = new Map<string, BracketEntry>();
  for (const region of REGIONS) {
    for (const matchup of model.firstRoundByRegion[region]) {
      for (const entry of matchup.options) {
        if (entry) entries.set(entry.id, entry);
      }
    }
  }
  return entries;
}

function matchupIndex(bracket: DerivedBracket) {
  const matchups = new Map<string, BracketMatchup>();

  for (const region of REGIONS) {
    const rounds = bracket.regions[region];
    for (const matchup of [
      ...rounds.roundOf64,
      ...rounds.roundOf32,
      ...rounds.sweet16,
      ...rounds.elite8,
    ]) {
      matchups.set(matchup.id, matchup);
    }
  }
  for (const matchup of bracket.finalFour) matchups.set(matchup.id, matchup);
  matchups.set(bracket.championship.id, bracket.championship);

  return matchups;
}

export default function SpreadsheetPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [profile, setProfile] = useState<PoolProfile | null>(null);
  const [profiles, setProfiles] = useState<PoolProfile[]>([]);
  const [brackets, setBrackets] = useState<PoolBracket[]>([]);
  const [games, setGames] = useState<TournamentGame[]>([]);
  const [model, setModel] = useState<TournamentModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [rainManEnabled, setRainManEnabled] = useState(false);
  const [rainManSelections, setRainManSelections] = useState<PickMap>({});
  const [rainManTiebreaker, setRainManTiebreaker] = useState("");
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef<number | null>(null);
  const seasonYearRef = useRef<number | null>(null);

  const loadSpreadsheet = useCallback(async () => {
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
        "[spreadsheet] Could not load tournament lifecycle",
        lifecycleError,
      );
      if (mountedRef.current) {
        setError("The family spreadsheet is temporarily unavailable.");
      }
      return false;
    }

    if (lifecycle.phase === "picks_open") {
      router.replace("/bracket");
      return true;
    }

    if (lifecycle.seasonYear === null || !lifecycle.fieldReady) {
      if (mountedRef.current) {
        setError("The tournament bracket is not ready yet.");
      }
      return false;
    }

    const activeSeasonYear = lifecycle.seasonYear;
    seasonYearRef.current = activeSeasonYear;

    const [profilesResult, bracketsResult, gamesResult, pairingResult] =
      await Promise.all([
      client
        .from("profiles")
        .select("user_id, username")
        .order("username"),
      client
        .from("brackets")
        .select(
          "id, user_id, season_year, display_name, is_primary, picks, tiebreaker_total, updated_at",
        )
        .eq("season_year", activeSeasonYear),
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
      bracketsResult.error ||
      gamesResult.error ||
      pairingResult.error ||
      !pairingResult.data
    ) {
      console.error("[spreadsheet] Could not load pool data", {
        profiles: profilesResult.error?.message,
        brackets: bracketsResult.error?.message,
        games: gamesResult.error?.message,
        pairing: pairingResult.error?.message,
      });
      if (mountedRef.current) {
        setError("The family spreadsheet is temporarily unavailable.");
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
      const loadedBrackets = (bracketsResult.data as RawBracket[]).map(
        (bracket) => ({
          ...bracket,
          picks: sanitizePicks(tournament, pickMap(bracket.picks)),
        }),
      );

      if (!mountedRef.current) return false;
      setUserId(userData.user.id);
      setIsCommissioner(
        userData.user.app_metadata?.role === "commissioner",
      );
      setProfile(currentProfile);
      setProfiles(loadedProfiles);
      setBrackets(loadedBrackets);
      setGames(loadedGames);
      setModel(tournament);
      setLastUpdated(new Date());
      setError("");
      return true;
    } catch (loadError) {
      console.error("[spreadsheet] Tournament model failed", loadError);
      if (mountedRef.current) {
        setError("The tournament bracket is not ready yet.");
      }
      return false;
    }
  }, [router]);

  const refreshGames = useCallback(async () => {
    const client = supabase;
    if (!client) return false;

    let lifecycle;
    try {
      lifecycle = await getTournamentLifecycle(client);
    } catch (lifecycleError) {
      console.error(
        "[spreadsheet] Could not refresh tournament lifecycle",
        lifecycleError,
      );
      return false;
    }

    if (lifecycle.phase === "picks_open") {
      router.replace("/bracket");
      return true;
    }

    if (
      lifecycle.seasonYear === null ||
      lifecycle.seasonYear !== seasonYearRef.current
    ) {
      return loadSpreadsheet();
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
        "[spreadsheet] Could not refresh games",
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
      setBrackets((current) =>
        current.map((bracket) => ({
          ...bracket,
          picks: sanitizePicks(tournament, bracket.picks),
        })),
      );
      setLastUpdated(new Date());
      return true;
    } catch (refreshError) {
      console.error("[spreadsheet] Game refresh failed", refreshError);
      return false;
    }
  }, [loadSpreadsheet, router]);

  const runRefresh = useCallback(
    async (fullRefresh = false) => {
      if (mountedRef.current) setRefreshing(true);
      try {
        return fullRefresh
          ? await loadSpreadsheet()
          : await refreshGames();
      } finally {
        if (mountedRef.current) setRefreshing(false);
      }
    },
    [loadSpreadsheet, refreshGames],
  );

  const scheduleRefresh = useCallback(() => {
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void runRefresh();
    }, 800);
  }, [runRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    const initialLoad = window.setTimeout(async () => {
      await loadSpreadsheet();
      if (mountedRef.current) setLoading(false);
    }, 0);
    const client = supabase;

    if (!client) {
      return () => {
        mountedRef.current = false;
        window.clearTimeout(initialLoad);
      };
    }

    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void runRefresh();
      }
    }, POLL_INTERVAL_MS);

    const channel = client
      .channel("zmm-spreadsheet-games")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "espn_games" },
        scheduleRefresh,
      )
      .subscribe();

    const refreshWhenActive = () => scheduleRefresh();
    window.addEventListener("focus", refreshWhenActive);
    window.addEventListener("online", refreshWhenActive);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(initialLoad);
      window.clearInterval(pollTimer);
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      window.removeEventListener("focus", refreshWhenActive);
      window.removeEventListener("online", refreshWhenActive);
      void client.removeChannel(channel);
    };
  }, [loadSpreadsheet, runRefresh, scheduleRefresh]);

  const officialLeaderboard = useMemo(
    () =>
      model
        ? buildLeaderboard(model, games, profiles, brackets)
        : {
            rows: [],
            championshipComplete: false,
            championshipTotal: null,
            pot: 0,
          },
    [brackets, games, model, profiles],
  );
  const officialOutcome = useMemo(
    () =>
      model
        ? buildActualResults(model, games)
        : { actualPicks: {}, results: [] },
    [games, model],
  );
  const rainManActive =
    rainManEnabled && !officialLeaderboard.championshipComplete;
  const projectedPicks = useMemo(
    () =>
      model && rainManActive
        ? buildProjectedPicks(model, games, rainManSelections)
        : officialOutcome.actualPicks,
    [
      games,
      model,
      officialOutcome.actualPicks,
      rainManActive,
      rainManSelections,
    ],
  );
  const projectedBracket = useMemo(
    () => (model ? deriveBracket(model, projectedPicks) : null),
    [model, projectedPicks],
  );
  const projectedMatchupById = useMemo(
    () =>
      projectedBracket
        ? matchupIndex(projectedBracket)
        : new Map<string, BracketMatchup>(),
    [projectedBracket],
  );
  const projectedTiebreakerTotal = useMemo(() => {
    if (rainManTiebreaker === "") return null;
    const total = Number(rainManTiebreaker);
    return Number.isInteger(total) && total >= 0 ? total : null;
  }, [rainManTiebreaker]);
  const projectedLeaderboard = useMemo(
    () =>
      model && rainManActive
        ? buildProjectedLeaderboard(
            model,
            games,
            profiles,
            brackets,
            rainManSelections,
            projectedTiebreakerTotal,
          )
        : null,
    [
      brackets,
      games,
      model,
      profiles,
      projectedTiebreakerTotal,
      rainManActive,
      rainManSelections,
    ],
  );
  const leaderboard =
    rainManActive && projectedLeaderboard
      ? projectedLeaderboard
      : officialLeaderboard;

  const groups = useMemo(
    () => (model ? buildSpreadsheetPickGroups(model, games) : []),
    [games, model],
  );
  const gameByMatchup = useMemo(
    () =>
      model
        ? buildMasterGameIndex(model, games)
        : new Map<string, TournamentGame>(),
    [games, model],
  );
  const masterTeamOrder = useMemo(
    () => (model ? buildMasterTeamOrder(model) : new Map<string, number>()),
    [model],
  );
  const entries = useMemo(() => (model ? entryIndex(model) : new Map()), [model]);
  const officialResultByMatchup = useMemo(
    () =>
      new Map(
        officialOutcome.results.map((result) => [result.matchupId, result]),
      ),
    [officialOutcome.results],
  );
  const masterScore = useMemo(
    () =>
      groups.reduce(
        (score, group) => {
          const matchupValue = ROUND_POINTS[group.roundNumber] ?? 0;
          for (const column of group.columns) {
            if (projectedPicks[column.id]) {
              score.points += matchupValue;
            } else {
              score.pointsLeft += matchupValue;
            }
          }
          return score;
        },
        { points: 0, pointsLeft: 0 },
      ),
    [groups, projectedPicks],
  );
  const bracketById = useMemo(
    () => new Map(brackets.map((bracket) => [bracket.id, bracket])),
    [brackets],
  );

  function toggleRainMan() {
    if (officialLeaderboard.championshipComplete) return;
    setRainManEnabled((enabled) => !enabled);
    setRainManSelections({});
    setRainManTiebreaker("");
  }

  function chooseRainManWinner(matchupId: string, entryId: string) {
    if (
      !model ||
      !rainManActive ||
      officialResultByMatchup.has(matchupId)
    ) {
      return;
    }

    setRainManSelections((current) =>
      buildProjectedPicks(model, games, {
        ...current,
        [matchupId]: entryId,
      }),
    );
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
        <span>Opening the family spreadsheet…</span>
      </main>
    );
  }

  if (error || !profile || !model) {
    return (
      <main className={styles.loading}>
        <Trophy size={38} />
        <strong>Spreadsheet unavailable</strong>
        <span>{error || "Please try again shortly."}</span>
        <button
          type="button"
          onClick={async () => {
            setLoading(true);
            await loadSpreadsheet();
            if (mountedRef.current) setLoading(false);
          }}
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={headerStyles.header}>
        <Link href="/march-madness" aria-label="Zerona March Madness home">
          <Image
            src="/zmm-logo.png"
            alt="Zerona March Madness"
            width={855}
            height={483}
            priority
          />
        </Link>
        <TournamentViewSwitcher activeView="spreadsheet" />
        <AccountMenu
          profile={profile}
          isCommissioner={isCommissioner}
          onSignOut={signOut}
        />
      </header>

      <section
        className={styles.sheetPanel}
        id="top"
        aria-label="Family pick spreadsheet"
      >
        <div className={styles.sheetToolbar}>
          <div className={styles.sheetHeading}>
            <span>{leaderboard.rows.length} PARTICIPANTS</span>
            <h2>Family Spreadsheet</h2>
          </div>
          <div className={styles.toolbarRight}>
            <button
              className={`${styles.rainManButton} ${
                rainManActive ? styles.rainManActive : ""
              }`}
              type="button"
              onClick={toggleRainMan}
              disabled={officialLeaderboard.championshipComplete}
              aria-pressed={rainManActive}
              title={
                officialLeaderboard.championshipComplete
                  ? "Rain Man is unavailable because the tournament is complete."
                  : "Try future winners and preview the projected standings."
              }
            >
              <CloudRain size={14} aria-hidden="true" />
              Rain Man
            </button>
            <div className={styles.legend} aria-label="Pick result legend">
              <span><i className={styles.correctKey} />Correct</span>
              <span><i className={styles.incorrectKey} />Incorrect</span>
              <span><i className={styles.pendingKey} />Pending</span>
            </div>
            <div className={styles.refreshStatus} aria-live="polite">
              <strong>{refreshing ? "Updating…" : "Live updates connected"}</strong>
              {lastUpdated && (
                <span>
                  Updated{" "}
                  {lastUpdated.toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
            <button
              className={styles.refreshButton}
              type="button"
              onClick={() => void runRefresh(true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={refreshing ? styles.spinner : undefined}
                size={14}
              />
              Refresh
            </button>
          </div>
        </div>

        <div className={styles.tableViewport}>
          <table className={styles.table}>
            <colgroup>
              <col className={styles.rankColumn} />
              <col className={styles.nameColumn} />
              <col className={styles.pointsColumn} />
              <col className={styles.possibleColumn} />
              <col className={styles.tiebreakerColumn} />
              {groups.flatMap((group) =>
                group.columns.map((column) => (
                  <col className={styles.gameColumn} key={column.id} />
                )),
              )}
            </colgroup>
            <thead>
              <tr>
                <th
                  className={`${styles.stickyCell} ${styles.rankCell}`}
                  rowSpan={2}
                  scope="col"
                >
                  Rank
                </th>
                <th
                  className={`${styles.stickyCell} ${styles.nameCell}`}
                  rowSpan={2}
                  scope="col"
                >
                  Participant
                </th>
                <th
                  className={`${styles.stickyCell} ${styles.pointsCell}`}
                  rowSpan={2}
                  scope="col"
                >
                  Points
                </th>
                <th
                  className={`${styles.stickyCell} ${styles.possibleCell}`}
                  rowSpan={2}
                  scope="col"
                >
                  Points left
                </th>
                <th
                  className={`${styles.stickyCell} ${styles.tiebreakerCell}`}
                  rowSpan={2}
                  scope="col"
                >
                  Tiebreaker
                </th>
                {groups.map((group) => (
                  <th
                    className={styles.roundGroup}
                    key={group.label}
                    colSpan={group.columns.length}
                    scope="colgroup"
                  >
                    {group.label}
                    <span>{group.date}</span>
                  </th>
                ))}
              </tr>
              <tr>
                {groups.flatMap((group) =>
                  group.columns.map((column) => {
                    const officialResult = officialResultByMatchup.get(
                      column.id,
                    );
                    const projectedMatchup = projectedMatchupById.get(column.id);

                    return (
                      <th
                        className={styles.pickColumn}
                        key={column.id}
                        scope="col"
                      >
                        <div className={styles.gameHeader}>
                          <MasterGameCard
                            matchupId={column.id}
                            roundNumber={column.roundNumber}
                            game={gameByMatchup.get(column.id)}
                            teamOrder={masterTeamOrder}
                            projectedOptions={
                              rainManActive && !officialResult
                                ? projectedMatchup?.options
                                : undefined
                            }
                            predictedWinnerEntryId={
                              rainManActive && !officialResult
                                ? projectedPicks[column.id]
                                : undefined
                            }
                          />
                        </div>
                      </th>
                    );
                  }),
                )}
              </tr>
            </thead>
            <tbody>
              <tr className={styles.masterRow}>
                <td
                  className={`${styles.stickyCell} ${styles.rankCell} ${styles.masterRank}`}
                >
                  <Trophy size={14} aria-label="Master results" />
                </td>
                <th
                  className={`${styles.stickyCell} ${styles.nameCell}`}
                  scope="row"
                >
                  <div
                    className={`${styles.participant} ${styles.masterParticipant}`}
                  >
                    <strong>Master</strong>
                    <span>
                      {rainManActive ? "Rain Man scenario" : "Official results"}
                    </span>
                  </div>
                </th>
                <td
                  className={`${styles.stickyCell} ${styles.pointsCell} ${styles.metric}`}
                >
                  {masterScore.points}
                </td>
                <td
                  className={`${styles.stickyCell} ${styles.possibleCell} ${styles.metric}`}
                >
                  {masterScore.pointsLeft}
                </td>
                <td
                  className={`${styles.stickyCell} ${styles.tiebreakerCell} ${styles.metric}`}
                >
                  {rainManActive ? (
                    <input
                      className={styles.rainManTiebreaker}
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={rainManTiebreaker}
                      onChange={(event) =>
                        setRainManTiebreaker(event.target.value)
                      }
                      placeholder="Total"
                      aria-label="Projected championship total points"
                    />
                  ) : (
                    (officialLeaderboard.championshipTotal ?? "\u2014")
                  )}
                </td>
                {groups.flatMap((group) =>
                  group.columns.map((column) => {
                    const officialResult = officialResultByMatchup.get(
                      column.id,
                    );
                    const winnerEntryId =
                      officialResult?.winnerEntryId ??
                      (rainManActive ? projectedPicks[column.id] : undefined);
                    const entry = winnerEntryId
                      ? entries.get(winnerEntryId)
                      : null;
                    const projectedMatchup = projectedMatchupById.get(column.id);
                    const options =
                      projectedMatchup?.options.filter(
                        (option): option is BracketEntry => Boolean(option),
                      ) ?? [];
                    const canPredict =
                      rainManActive && !officialResult && options.length === 2;
                    const isPredicted = Boolean(
                      rainManActive && !officialResult && entry,
                    );

                    if (rainManActive && !officialResult) {
                      return (
                        <td
                          className={`${styles.pick} ${
                            isPredicted
                              ? styles.predictedMasterPick
                              : styles.rainManPick
                          }`}
                          key={column.id}
                        >
                          <select
                            className={styles.rainManSelect}
                            value={winnerEntryId ?? ""}
                            onChange={(event) =>
                              chooseRainManWinner(
                                column.id,
                                event.target.value,
                              )
                            }
                            disabled={!canPredict}
                            aria-label={`Predict the winner of ${column.label}`}
                          >
                            <option value="">
                              {canPredict
                                ? "Choose winner"
                                : "Awaiting matchup"}
                            </option>
                            {options.map((option) => (
                              <option key={option.id} value={option.id}>
                                #{option.seed} {option.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    }

                    return (
                      <td
                        className={`${styles.pick} ${
                          entry ? styles.masterPick : styles.emptyPick
                        }`}
                        key={column.id}
                        title={
                          entry
                            ? `Official winner: #${entry.seed} ${entry.name}`
                            : "Awaiting official result"
                        }
                      >
                        {entry ? `#${entry.seed} ${entry.name}` : "\u2014"}
                      </td>
                    );
                  }),
                )}
              </tr>
              {leaderboard.rows.map((row) => {
                const bracket = bracketById.get(row.bracketId);
                const isCurrentUser = row.ownerUserId === userId;

                return (
                  <tr
                    className={isCurrentUser ? styles.currentUserRow : undefined}
                    key={row.bracketId}
                  >
                    <td
                      className={`${styles.stickyCell} ${styles.rankCell} ${styles.rank}`}
                    >
                      {row.rank}
                    </td>
                    <th
                      className={`${styles.stickyCell} ${styles.nameCell}`}
                      scope="row"
                    >
                      <div className={styles.participant}>
                        <strong>
                          {row.displayName}
                          {isCurrentUser && (
                            <span className={styles.youBadge}>You</span>
                          )}
                        </strong>
                        <span>@{row.username}</span>
                      </div>
                    </th>
                    <td
                      className={`${styles.stickyCell} ${styles.pointsCell} ${styles.metric}`}
                    >
                      {row.points}
                    </td>
                    <td
                      className={`${styles.stickyCell} ${styles.possibleCell} ${styles.metric}`}
                    >
                      {row.possiblePointsRemaining}
                    </td>
                    <td
                      className={`${styles.stickyCell} ${styles.tiebreakerCell} ${styles.metric}`}
                    >
                      {row.tiebreaker ?? "—"}
                    </td>
                    {groups.flatMap((group) =>
                      group.columns.map((column) => {
                        const pickedId = bracket?.picks[column.id];
                        const entry = pickedId ? entries.get(pickedId) : null;
                        const officialResult = officialResultByMatchup.get(
                          column.id,
                        );
                        const predictedWinnerId =
                          rainManActive && !officialResult
                            ? projectedPicks[column.id]
                            : undefined;
                        const winnerEntryId =
                          officialResult?.winnerEntryId ?? predictedWinnerId;
                        const resultClass = winnerEntryId
                          ? winnerEntryId === pickedId
                            ? predictedWinnerId
                              ? styles.projectedCorrectPick
                              : styles.correctPick
                            : predictedWinnerId
                              ? styles.projectedIncorrectPick
                              : styles.incorrectPick
                          : "";

                        return (
                          <td
                            className={`${styles.pick} ${
                              entry ? resultClass : styles.emptyPick
                            }`}
                            key={column.id}
                            title={
                              entry
                                ? `#${entry.seed} ${entry.name}`
                                : "No pick"
                            }
                          >
                            {entry ? `#${entry.seed} ${entry.name}` : "—"}
                          </td>
                        );
                      }),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
