export const REGIONS = ["east", "west", "south", "midwest"] as const;

export type Region = (typeof REGIONS)[number];

export type EspnGameRow = {
  espn_event_id: string;
  region: Region | null;
  round_code: string;
  starts_at: string;
  home_team_id: string;
  home_team_name: string;
  home_team_seed: number | null;
  away_team_id: string;
  away_team_name: string;
  away_team_seed: number | null;
};

export type BracketEntry = {
  id: string;
  name: string;
  seed: number;
  region: Region;
  teamIds: string[];
  isPlayIn: boolean;
};

export type BracketMatchup = {
  id: string;
  roundNumber: number;
  matchupIndex: number;
  options: [BracketEntry | null, BracketEntry | null];
};

export type RegionRounds = {
  roundOf64: BracketMatchup[];
  roundOf32: BracketMatchup[];
  sweet16: BracketMatchup[];
  elite8: BracketMatchup[];
};

export type TournamentModel = {
  seasonYear: number;
  firstRoundByRegion: Record<Region, BracketMatchup[]>;
};

export type DerivedBracket = {
  regions: Record<Region, RegionRounds>;
  finalFour: BracketMatchup[];
  championship: BracketMatchup;
  champion: BracketEntry | null;
};

export type PickMap = Record<string, string>;
