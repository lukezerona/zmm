"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  House,
  LoaderCircle,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isCommissionerUser } from "@/lib/commissioner";
import { getTournamentLifecycle } from "@/lib/tournament-lifecycle";
import {
  EspnGameRow,
  PickMap,
  TournamentModel,
  TournamentRegionPairingRow,
} from "../bracket/bracket-types";
import { buildTournamentModel, sanitizePicks } from "../bracket/bracket-utils";
import { AccountMenu } from "../march-madness/account-menu";
import { Leaderboard } from "../march-madness/leaderboard";
import { TournamentBracketViewer } from "../march-madness/tournament-bracket-viewer";
import {
  PoolBracket,
  PoolProfile,
  TournamentGame,
} from "../march-madness/tournament-types";
import { buildLeaderboard } from "../march-madness/tournament-utils";
import { useMobileTournamentViewport } from "../march-madness/use-mobile-tournament-viewport";
import { TournamentViewSwitcher } from "../march-madness/view-switcher";
import styles from "../march-madness/march-madness.module.css";

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
type ChampionshipSeason = {
  season_year: number;
  completed: boolean;
};
type MobileHistoryView = "bracket" | "leaderboard";

function pickMap(value: unknown): PickMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const isMobileTournamentViewport = useMobileTournamentViewport();
  const mountedRef = useRef(true);
  const [userId, setUserId] = useState("");
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [profile, setProfile] = useState<PoolProfile | null>(null);
  const [profiles, setProfiles] = useState<PoolProfile[]>([]);
  const [brackets, setBrackets] = useState<PoolBracket[]>([]);
  const [games, setGames] = useState<TournamentGame[]>([]);
  const [model, setModel] = useState<TournamentModel | null>(null);
  const [historyYears, setHistoryYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [createBracketAvailable, setCreateBracketAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingSeason, setLoadingSeason] = useState(false);
  const [error, setError] = useState("");
  const [mobileHistoryView, setMobileHistoryView] =
    useState<MobileHistoryView>("bracket");

  const loadSeason = useCallback(async (seasonYear: number) => {
    const client = supabase;
    if (!client) return false;

    const [profilesResult, bracketsResult, gamesResult, pairingResult] =
      await Promise.all([
        client
          .from("profiles")
          .select("user_id, username")
          .order("username"),
        client
          .from("brackets")
          .select(
            "id, user_id, season_year, display_name, is_primary, picks, tiebreaker_total, created_at, updated_at",
          )
          .eq("season_year", seasonYear),
        client
          .from("espn_games")
          .select(ESPN_GAME_SELECT)
          .eq("season_year", seasonYear)
          .in("round_code", TOURNAMENT_ROUND_CODES),
        client
          .from("tournament_region_pairings")
          .select(
            "season_year, left_top_region, left_bottom_region, right_top_region, right_bottom_region",
          )
          .eq("season_year", seasonYear)
          .maybeSingle(),
      ]);

    if (
      profilesResult.error ||
      bracketsResult.error ||
      gamesResult.error ||
      pairingResult.error ||
      !pairingResult.data
    ) {
      console.error("[history] Could not load season", {
        profiles: profilesResult.error?.message,
        brackets: bracketsResult.error?.message,
        games: gamesResult.error?.message,
        pairing: pairingResult.error?.message,
      });
      if (mountedRef.current) {
        setError(`The ${seasonYear} tournament history is unavailable.`);
      }
      return false;
    }

    try {
      const loadedGames = gamesResult.data as TournamentGame[];
      const tournament = buildTournamentModel(
        loadedGames as EspnGameRow[],
        seasonYear,
        pairingResult.data as TournamentRegionPairingRow,
      );
      const loadedBrackets = (bracketsResult.data as RawBracket[]).map(
        (bracket) => ({
          ...bracket,
          picks: sanitizePicks(tournament, pickMap(bracket.picks)),
        }),
      );
      const loadedProfiles = profilesResult.data as PoolProfile[];
      const knownProfiles = new Map(
        loadedProfiles.map((candidate) => [candidate.user_id, candidate]),
      );
      for (const bracket of loadedBrackets) {
        if (!knownProfiles.has(bracket.user_id)) {
          knownProfiles.set(bracket.user_id, {
            user_id: bracket.user_id,
            username: "archived",
          });
        }
      }

      if (!mountedRef.current) return false;
      setSelectedYear(seasonYear);
      setProfiles([...knownProfiles.values()]);
      setBrackets(loadedBrackets);
      setGames(loadedGames);
      setModel(tournament);
      setError("");
      return true;
    } catch (loadError) {
      console.error("[history] Tournament model failed", loadError);
      if (mountedRef.current) {
        setError(`The ${seasonYear} tournament bracket is unavailable.`);
      }
      return false;
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const client = supabase;
    if (!client) {
      router.replace("/");
      return;
    }

    const { data: userData } = await client.auth.getUser();
    if (!userData.user) {
      router.replace("/");
      return;
    }

    try {
      const lifecycle = await getTournamentLifecycle(client);
      const [profilesResult, seasonsResult] = await Promise.all([
        client
          .from("profiles")
          .select("user_id, username")
          .order("username"),
        client
          .from("espn_games")
          .select("season_year, completed")
          .eq("round_code", "CHAMPIONSHIP")
          .eq("completed", true)
          .order("season_year", { ascending: false }),
      ]);

      if (profilesResult.error || seasonsResult.error) {
        throw profilesResult.error ?? seasonsResult.error;
      }

      const loadedProfiles = profilesResult.data as PoolProfile[];
      const currentProfile = loadedProfiles.find(
        (candidate) => candidate.user_id === userData.user.id,
      );
      if (!currentProfile) {
        router.replace("/accept-invite");
        return;
      }

      const years = [
        ...new Set(
          (seasonsResult.data as ChampionshipSeason[])
            .map((season) => season.season_year)
            .filter(
              (year) =>
                year !==
                (lifecycle.configuredSeasonYear ?? lifecycle.seasonYear),
            ),
        ),
      ].sort((a, b) => b - a);

      if (!mountedRef.current) return;
      setUserId(userData.user.id);
      setIsCommissioner(isCommissionerUser(userData.user));
      setProfile(currentProfile);
      setProfiles(loadedProfiles);
      setHistoryYears(years);
      setCreateBracketAvailable(lifecycle.phase === "picks_open");

      if (years.length > 0) {
        const requestedYear = Number(
          new URLSearchParams(window.location.search).get("season"),
        );
        const initialYear = years.includes(requestedYear)
          ? requestedYear
          : years[0];
        await loadSeason(initialYear);
      }
    } catch (loadError) {
      console.error("[history] Could not load tournament history", loadError);
      if (mountedRef.current) {
        setError("Tournament history is temporarily unavailable.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [loadSeason, router]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(() => void loadHistory(), 0);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(timer);
    };
  }, [loadHistory]);

  const leaderboard = useMemo(
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
  const championship = games.find((game) => game.round_number === 6);
  const champion = championship
    ? championship.home_winner
      ? championship.home_team_name
      : championship.away_winner
        ? championship.away_team_name
        : "To be determined"
    : "To be determined";
  const championshipScore =
    championship?.home_score !== null &&
    championship?.home_score !== undefined &&
    championship.away_score !== null
      ? `${championship.home_score}–${championship.away_score}`
      : "—";

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  async function chooseYear(year: number) {
    setLoadingSeason(true);
    const loaded = await loadSeason(year);
    if (loaded) {
      router.replace(`/history?season=${year}`, { scroll: false });
    }
    if (mountedRef.current) setLoadingSeason(false);
  }

  function showMobileHistoryView(view: MobileHistoryView) {
    setMobileHistoryView(view);
    window.requestAnimationFrame(() => {
      document
        .getElementById("history-results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <LoaderCircle className={styles.spinner} size={30} />
        <span>Opening tournament history…</span>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className={styles.loading}>
        <Trophy size={38} />
        <strong>Tournament history unavailable</strong>
        <span>{error || "Please try again shortly."}</span>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError("");
            void loadHistory();
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
          spreadsheetAvailable={selectedYear !== null}
          bracketsHref={
            selectedYear === null ? "/history" : `/history?season=${selectedYear}`
          }
          spreadsheetHref={
            selectedYear === null
              ? "/spreadsheet"
              : `/spreadsheet?season=${selectedYear}`
          }
        />
        <div className={styles.headerUserActions}>
          {isCommissioner && (
            <Link
              className={styles.headerCommissionerButton}
              href={{
                pathname: "/commissioner",
                query: {
                  returnTo:
                    selectedYear === null
                      ? "/history"
                      : `/history?season=${selectedYear}`,
                },
              }}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Commissioner
            </Link>
          )}
          <AccountMenu
            profile={profile}
            isCommissioner={isCommissioner}
            commissionerReturnTo={
              selectedYear === null
                ? "/history"
                : `/history?season=${selectedYear}`
            }
            commissionerShortcutVisible
            historyShortcutVisible={false}
            onSignOut={signOut}
          />
        </div>
      </header>

      {isMobileTournamentViewport && historyYears.length > 0 && (
        <nav
          className={`${styles.mobileTournamentTabs} ${styles.mobileHistoryTabs}`}
          aria-label="Tournament history sections"
        >
          {(
            [
              ["bracket", "Bracket"],
              ["leaderboard", "Leaderboard"],
            ] as const
          ).map(([view, label]) => (
            <button
              type="button"
              key={view}
              className={
                mobileHistoryView === view
                  ? styles.mobileTournamentTabActive
                  : ""
              }
              onClick={() => showMobileHistoryView(view)}
              aria-current={
                mobileHistoryView === view ? "page" : undefined
              }
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      <section className={styles.historyHero} id="top">
        <div>
          <span>THE ZMM ARCHIVE</span>
          <h1>Tournament history</h1>
          <p>
            Revisit final results and see how every family bracket finished.
          </p>
        </div>
        <div className={styles.historyControls}>
          <Link className={styles.historyAction} href="/march-madness">
            <House size={17} aria-hidden="true" />
            Current tournament
          </Link>
          {createBracketAvailable && (
            <Link className={styles.historyAction} href="/bracket">
              <ArrowLeft size={17} aria-hidden="true" />
              Back to create bracket
            </Link>
          )}
          {historyYears.length > 0 && (
            <label className={styles.historyYearPicker}>
              <span>Season</span>
              <select
                value={selectedYear ?? ""}
                onChange={(event) =>
                  void chooseYear(Number(event.target.value))
                }
                disabled={loadingSeason}
              >
                {historyYears.map((year) => (
                  <option value={year} key={year}>
                    {year} Tournament
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {historyYears.length === 0 ? (
        <section className={styles.historyEmpty}>
          <CalendarDays size={34} aria-hidden="true" />
          <span>NO COMPLETED PAST SEASONS YET</span>
          <h2>The archive begins after this tournament.</h2>
          <p>
            Once a future season starts, the completed {new Date().getFullYear()}{" "}
            tournament will appear here automatically with its brackets,
            standings, and final outcomes.
          </p>
        </section>
      ) : loadingSeason || !model || selectedYear === null ? (
        <section className={styles.historyEmpty}>
          <LoaderCircle className={styles.spinner} size={30} />
          <strong>Loading the selected season…</strong>
        </section>
      ) : (
        <>
          <section
            className={`${styles.summaryGrid} ${styles.historySummary}`}
            aria-label={`${selectedYear} tournament summary`}
          >
            <article>
              <Trophy size={19} />
              <span>National champion</span>
              <strong>{champion}</strong>
            </article>
            <article>
              <CalendarDays size={19} />
              <span>Championship score</span>
              <strong>{championshipScore}</strong>
            </article>
            <article>
              <Users size={19} />
              <span>Family brackets</span>
              <strong>{brackets.length}</strong>
            </article>
            <article>
              <Trophy size={19} />
              <span>Pool winner</span>
              <strong>{leaderboard.rows[0]?.displayName ?? "—"}</strong>
            </article>
          </section>

          <section
            id="history-results"
            className={`${styles.tournamentWorkspace} ${
              mobileHistoryView === "bracket"
                ? styles.mobileBracketActive
                : styles.mobileLeaderboardActive
            }`}
            aria-label={`${selectedYear} brackets and final standings`}
          >
            <div className={styles.bracketPane}>
              <TournamentBracketViewer
                model={model}
                games={games}
                brackets={brackets}
                currentUserId={userId}
                leaderboardRows={leaderboard.rows}
              />
            </div>
            <aside className={styles.leaderboardPane}>
              <div className={styles.leaderboardSidebarHeading}>
                <div>
                  <span>FINAL {selectedYear} RESULTS</span>
                  <h2>Leaderboard</h2>
                </div>
              </div>
              <Leaderboard
                rows={leaderboard.rows}
                currentUserId={userId}
                seasonYear={selectedYear}
              />
              <p className={styles.payoutNote}>
                Final standings include championship tiebreaker rules.
              </p>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}
