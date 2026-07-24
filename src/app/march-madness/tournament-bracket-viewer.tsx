"use client";

import { useMemo, useState } from "react";
import { deriveBracket } from "../bracket/bracket-utils";
import { TournamentModel } from "../bracket/bracket-types";
import {
  LeaderboardEntry,
  PoolBracket,
  PoolProfile,
  TournamentGame,
} from "./tournament-types";
import { TournamentBracketCanvas } from "./tournament-bracket-canvas";
import { buildActualResults } from "./tournament-utils";
import styles from "./march-madness.module.css";

const MASTER_VALUE = "master";

export function TournamentBracketViewer({
  model,
  games,
  brackets,
  profiles,
  currentUserId,
  leaderboardRows,
}: {
  model: TournamentModel;
  games: TournamentGame[];
  brackets: PoolBracket[];
  profiles: PoolProfile[];
  currentUserId: string;
  leaderboardRows: LeaderboardEntry[];
}) {
  const orderedBrackets = useMemo(() => {
    const profileByUser = new Map(
      profiles.map((profile) => [profile.user_id, profile]),
    );
    const rankByUser = new Map(
      leaderboardRows.map((entry, index) => [entry.userId, index]),
    );

    return [...brackets].sort((a, b) => {
      const rankDifference =
        (rankByUser.get(a.user_id) ?? Number.MAX_SAFE_INTEGER) -
        (rankByUser.get(b.user_id) ?? Number.MAX_SAFE_INTEGER);

      if (rankDifference !== 0) return rankDifference;

      return (
        profileByUser
          .get(a.user_id)
          ?.display_name.localeCompare(
            profileByUser.get(b.user_id)?.display_name ?? "",
          ) ?? 0
      );
    });
  }, [brackets, leaderboardRows, profiles]);
  const [selectedValue, setSelectedValue] = useState(MASTER_VALUE);
  const selectedBracket = orderedBrackets.find(
    (bracket) => bracket.user_id === selectedValue,
  );
  const selectedProfile = profiles.find(
    (profile) => profile.user_id === selectedBracket?.user_id,
  );
  const playerBracket = selectedBracket
    ? deriveBracket(model, selectedBracket.picks)
    : null;
  const actualPicks = useMemo(
    () => buildActualResults(model, games).actualPicks,
    [games, model],
  );

  return (
    <div className={styles.bracketViewer}>
      <div className={styles.bracketViewerToolbar}>
        <div>
          <span>Viewing bracket</span>
          <strong>
            {selectedValue === MASTER_VALUE
              ? "Master tournament results"
              : `${selectedProfile?.display_name ?? "Unknown player"}${
                  selectedBracket?.user_id === currentUserId ? " (You)" : ""
                }`}
          </strong>
        </div>
        <label>
          <span>Choose a bracket</span>
          <select
            value={selectedValue}
            onChange={(event) => setSelectedValue(event.target.value)}
          >
            <option value={MASTER_VALUE}>Master bracket</option>
            <optgroup label="Family brackets">
              {orderedBrackets.map((savedBracket) => {
                const profile = profiles.find(
                  (candidate) => candidate.user_id === savedBracket.user_id,
                );
                return (
                  <option
                    value={savedBracket.user_id}
                    key={savedBracket.user_id}
                  >
                    {profile?.display_name ?? "Unknown player"}
                    {savedBracket.user_id === currentUserId ? " (You)" : ""}
                  </option>
                );
              })}
            </optgroup>
          </select>
        </label>
      </div>

      {selectedValue === MASTER_VALUE ? (
        <TournamentBracketCanvas
          model={model}
          view={{ type: "master", games }}
        />
      ) : selectedBracket && playerBracket ? (
        <TournamentBracketCanvas
          model={model}
          view={{
            type: "player",
            bracket: playerBracket,
            picks: selectedBracket.picks,
            actualPicks,
            tiebreaker: selectedBracket.tiebreaker_total,
          }}
        />
      ) : (
        <p className={styles.emptyState}>This bracket is not available.</p>
      )}
    </div>
  );
}
