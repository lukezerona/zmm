"use client";

import { useMemo, useState } from "react";
import { BracketBoard } from "../bracket/bracket-board";
import { deriveBracket } from "../bracket/bracket-utils";
import { TournamentModel } from "../bracket/bracket-types";
import { PoolBracket, PoolProfile } from "./tournament-types";
import styles from "./march-madness.module.css";

export function PlayerBracketViewer({
  model,
  brackets,
  profiles,
  currentUserId,
}: {
  model: TournamentModel;
  brackets: PoolBracket[];
  profiles: PoolProfile[];
  currentUserId: string;
}) {
  const orderedBrackets = useMemo(() => {
    const profileByUser = new Map(
      profiles.map((profile) => [profile.user_id, profile]),
    );
    return [...brackets].sort((a, b) => {
      if (a.user_id === currentUserId) return -1;
      if (b.user_id === currentUserId) return 1;
      return (
        profileByUser
          .get(a.user_id)
          ?.display_name.localeCompare(
            profileByUser.get(b.user_id)?.display_name ?? "",
          ) ?? 0
      );
    });
  }, [brackets, currentUserId, profiles]);
  const [selectedUserId, setSelectedUserId] = useState(
    orderedBrackets[0]?.user_id ?? "",
  );
  const selected =
    orderedBrackets.find((bracket) => bracket.user_id === selectedUserId) ??
    orderedBrackets[0];
  const profile = profiles.find(
    (candidate) => candidate.user_id === selected?.user_id,
  );
  const bracket = selected ? deriveBracket(model, selected.picks) : null;

  if (!selected || !bracket) {
    return <p className={styles.emptyState}>No saved brackets are available.</p>;
  }

  return (
    <div className={styles.viewer}>
      <div className={styles.viewerToolbar}>
        <div>
          <span>Viewing bracket</span>
          <strong>
            {profile?.display_name ?? "Unknown player"}
            {selected.user_id === currentUserId ? " (You)" : ""}
          </strong>
        </div>
        <label>
          <span>Choose a player</span>
          <select
            value={selected.user_id}
            onChange={(event) => setSelectedUserId(event.target.value)}
          >
            {orderedBrackets.map((savedBracket) => {
              const savedProfile = profiles.find(
                (candidate) => candidate.user_id === savedBracket.user_id,
              );
              return (
                <option
                  value={savedBracket.user_id}
                  key={savedBracket.user_id}
                >
                  {savedProfile?.display_name ?? "Unknown player"}
                  {savedBracket.user_id === currentUserId ? " (You)" : ""}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <BracketBoard
        bracket={bracket}
        picks={selected.picks}
        onPick={() => undefined}
        roundDates={model.roundDates}
        tiebreaker={
          selected.tiebreaker_total === null
            ? ""
            : String(selected.tiebreaker_total)
        }
        onTiebreakerChange={() => undefined}
        readOnly
      />
    </div>
  );
}
