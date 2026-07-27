import { EspnGameRow, PickMap } from "../bracket/bracket-types";

export type TournamentGame = EspnGameRow & {
  round_number: number | null;
  broadcast: string | null;
  status_state: string;
  status_description: string | null;
  status_detail: string | null;
  completed: boolean;
  period: number | null;
  clock: string | null;
  home_score: number | null;
  home_winner: boolean;
  away_score: number | null;
  away_winner: boolean;
};
export type PoolProfile = {
  user_id: string;
  username: string;
};

export type PoolBracket = {
  id: string;
  user_id: string;
  season_year: number;
  display_name: string;
  is_primary: boolean;
  picks: PickMap;
  tiebreaker_total: number | null;
  updated_at: string;
};

export type LeaderboardEntry = {
  bracketId: string;
  ownerUserId: string;
  username: string;
  displayName: string;
  rank: number;
  points: number;
  possiblePointsRemaining: number;
  champion: string;
  championEliminated: boolean;
  championWon: boolean;
  tiebreaker: number | null;
  correctPicks: number;
  completedGames: number;
  correctPercentage: number;
  prize: number;
  tiebreakerDistance: number | null;
};
