import type { SupabaseClient } from "@supabase/supabase-js";
import { getTournamentStartingPath } from "./tournament-preference";

export const CREATION_TEST_SEASON_YEAR = 2026;

export type TournamentPhase = "setup" | "picks_open" | "live" | "final";

export type TournamentLifecycle = {
  seasonYear: number | null;
  configuredSeasonYear: number | null;
  phase: TournamentPhase;
  fieldReady: boolean;
  entryDeadline: string | null;
  championshipTipoff: string | null;
  championshipComplete: boolean;
};

type TournamentLifecycleRow = {
  season_year: number | null;
  configured_season_year: number | null;
  phase: TournamentPhase;
  field_ready: boolean;
  entry_deadline: string | null;
  championship_tipoff: string | null;
  championship_complete: boolean;
};

export async function getTournamentLifecycle(
  client: SupabaseClient,
): Promise<TournamentLifecycle> {
  const { data, error } = await client
    .rpc("get_tournament_lifecycle")
    .maybeSingle<TournamentLifecycleRow>();

  if (error) throw error;
  if (!data) {
    throw new Error("Tournament lifecycle data is unavailable.");
  }

  return {
    seasonYear: data.season_year,
    configuredSeasonYear: data.configured_season_year,
    phase: data.phase,
    fieldReady: data.field_ready,
    entryDeadline: data.entry_deadline,
    championshipTipoff: data.championship_tipoff,
    championshipComplete: data.championship_complete,
  };
}

export function tournamentDestination(lifecycle: TournamentLifecycle) {
  return lifecycle.phase === "picks_open"
    ? "/bracket"
    : getTournamentStartingPath();
}
