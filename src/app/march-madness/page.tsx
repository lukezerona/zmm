"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDollarSign,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Radio,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  EspnGameRow,
  PickMap,
  TournamentModel,
} from "../bracket/bracket-types";
import { buildTournamentModel, sanitizePicks } from "../bracket/bracket-utils";
import { Leaderboard } from "./leaderboard";
import { MasterBracket } from "./master-bracket";
import { PlayerBracketViewer } from "./player-bracket-viewer";
import {
  PoolBracket,
  PoolProfile,
  TournamentGame,
} from "./tournament-types";
import { buildLeaderboard } from "./tournament-utils";
import styles from "./march-madness.module.css";

const SEASON_YEAR = 2026;

type RawBracket = Omit<PoolBracket, "picks"> & { picks: unknown };

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
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<PoolProfile | null>(null);
  const [profiles, setProfiles] = useState<PoolProfile[]>([]);
  const [brackets, setBrackets] = useState<PoolBracket[]>([]);
  const [games, setGames] = useState<TournamentGame[]>([]);
  const [model, setModel] = useState<TournamentModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = useCallback(
    async (background = false) => {
      const client = supabase;
      if (!client) {
        router.replace("/");
        return;
      }

      if (background) setRefreshing(true);
      const { data: userData } = await client.auth.getUser();
      if (!userData.user) {
        router.replace("/");
        return;
      }

      const [profilesResult, bracketsResult, gamesResult] = await Promise.all([
        client
          .from("profiles")
          .select("user_id, username, display_name")
          .order("display_name"),
        client
          .from("brackets")
          .select(
            "user_id, season_year, picks, tiebreaker_total, updated_at",
          )
          .eq("season_year", SEASON_YEAR),
        client
          .from("espn_games")
          .select(
            "espn_event_id, region, round_code, round_number, starts_at, broadcast, status_state, status_description, status_detail, completed, period, clock, home_team_id, home_team_name, home_team_seed, home_score, home_winner, away_team_id, away_team_name, away_team_seed, away_score, away_winner",
          )
          .eq("season_year", SEASON_YEAR)
          .in("round_code", [
            "PLAY_IN",
            "ROUND_OF_64",
            "ROUND_OF_32",
            "SWEET_16",
            "ELITE_8",
            "FINAL_FOUR",
            "CHAMPIONSHIP",
          ]),
      ]);

      if (profilesResult.error || bracketsResult.error || gamesResult.error) {
        console.error("[dashboard] Could not load tournament", {
          profiles: profilesResult.error?.message,
          brackets: bracketsResult.error?.message,
          games: gamesResult.error?.message,
        });
        setError("Tournament Central is temporarily unavailable.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const loadedProfiles = profilesResult.data as PoolProfile[];
      const currentProfile = loadedProfiles.find(
        (candidate) => candidate.user_id === userData.user.id,
      );
      if (!currentProfile) {
        router.replace("/accept-invite");
        return;
      }

      try {
        const loadedGames = gamesResult.data as TournamentGame[];
        const tournament = buildTournamentModel(
          loadedGames as EspnGameRow[],
          SEASON_YEAR,
        );
        const loadedBrackets = (bracketsResult.data as RawBracket[]).map(
          (bracket) => ({
            ...bracket,
            picks: sanitizePicks(tournament, pickMap(bracket.picks)),
          }),
        );

        setUserId(userData.user.id);
        setProfile(currentProfile);
        setProfiles(loadedProfiles);
        setBrackets(loadedBrackets);
        setGames(loadedGames);
        setModel(tournament);
        setLastUpdated(new Date());
        setError("");
      } catch (loadError) {
        console.error("[dashboard] Tournament model failed", loadError);
        setError("The tournament bracket is not ready yet.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadDashboard(), 0);
    const client = supabase;
    if (!client) {
      return () => window.clearTimeout(initialLoad);
    }

    const channel = client
      .channel("zmm-tournament-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "espn_games" },
        () => void loadDashboard(true),
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialLoad);
      void client.removeChannel(channel);
    };
  }, [loadDashboard]);

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
  const tournamentGames = games.filter(
    (game) => game.round_number !== null && game.round_number >= 1,
  );
  const finalGames = tournamentGames.filter((game) => game.completed).length;
  const liveGames = tournamentGames.filter(
    (game) => game.status_state === "in" && !game.completed,
  ).length;
  const upcomingGames = tournamentGames.length - finalGames - liveGames;

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <LoaderCircle className={styles.spinner} size={30} />
        <span>Opening Tournament Central…</span>
      </main>
    );
  }

  if (error || !profile || !model) {
    return (
      <main className={styles.loading}>
        <Trophy size={38} />
        <strong>Tournament Central unavailable</strong>
        <span>{error || "Please try again shortly."}</span>
        <button type="button" onClick={() => void loadDashboard()}>
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="#top" aria-label="Zerona March Madness home">
          <Image
            src="/zmm-logo.png"
            alt="Zerona March Madness"
            width={855}
            height={483}
            priority
          />
        </a>
        <nav aria-label="Tournament sections">
          <a href="#leaderboard">Leaderboard</a>
          <a href="#master-bracket">Master bracket</a>
          <a href="#family-brackets">Family brackets</a>
        </nav>
        <button type="button" onClick={signOut}>
          <LogOut size={16} /> Sign out
        </button>
      </header>

      <section className={styles.hero} id="top">
        <div>
          <span className={styles.kicker}>{SEASON_YEAR} TOURNAMENT CENTRAL</span>
          <h1>
            Welcome back, <em>{profile.display_name}</em>.
          </h1>
          <p>
            Follow the tournament, track every bracket, and see where the
            family standings land.
          </p>
        </div>
        <div className={styles.lockCard}>
          <LockKeyhole size={20} aria-hidden="true" />
          <div>
            <strong>Entries are locked</strong>
            <span>All saved brackets are now read-only.</span>
          </div>
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

      <section className={styles.section} id="leaderboard">
        <div className={styles.sectionHeading}>
          <div>
            <span>FAMILY STANDINGS</span>
            <h2>Leaderboard</h2>
            <p>
              Round values increase from 1 point in the Round of 64 to 32
              points for the championship.
            </p>
          </div>
          <div className={styles.updated}>
            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={refreshing ? styles.spinner : ""}
                size={15}
              />
              Refresh
            </button>
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
        </div>
        <Leaderboard rows={leaderboard.rows} currentUserId={userId} />
        <p className={styles.payoutNote}>
          $10 buy-in · First place 60% · Second place 30% · Third place 10%.
          {leaderboard.championshipComplete
            ? " Final ties are ordered by championship tiebreaker distance."
            : " Current ties split the combined payouts for their occupied places."}
        </p>
      </section>

      <section className={styles.section} id="master-bracket">
        <div className={styles.sectionHeading}>
          <div>
            <span>THE SOURCE OF TRUTH</span>
            <h2>Master bracket</h2>
            <p>
              Scores and game states come directly from the latest ESPN sync.
            </p>
          </div>
        </div>
        <MasterBracket model={model} games={games} />
      </section>

      <section
        className={`${styles.section} ${styles.familySection}`}
        id="family-brackets"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span>LOCKED PICKS</span>
            <h2>Family brackets</h2>
            <p>Choose any display name to review that person’s saved picks.</p>
          </div>
        </div>
        <PlayerBracketViewer
          model={model}
          brackets={brackets}
          profiles={profiles}
          currentUserId={userId}
        />
      </section>
    </main>
  );
}
