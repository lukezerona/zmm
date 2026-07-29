"use client";

import { useSyncExternalStore } from "react";

const MOBILE_TOURNAMENT_QUERY = "(max-width: 760px)";

function subscribe(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_TOURNAMENT_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(MOBILE_TOURNAMENT_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

export function useMobileTournamentViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
