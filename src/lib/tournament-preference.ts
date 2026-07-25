export type TournamentStartingScreen = "brackets" | "spreadsheet";

const STARTING_SCREEN_KEY = "zmm:starting-screen";
const STARTING_SCREEN_EVENT = "zmm:starting-screen-change";

export function getTournamentStartingScreen(): TournamentStartingScreen {
  if (typeof window === "undefined") return "brackets";

  return window.localStorage.getItem(STARTING_SCREEN_KEY) === "spreadsheet"
    ? "spreadsheet"
    : "brackets";
}

export function setTournamentStartingScreen(
  screen: TournamentStartingScreen,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STARTING_SCREEN_KEY, screen);
  window.dispatchEvent(new Event(STARTING_SCREEN_EVENT));
}

export function subscribeToTournamentStartingScreen(
  onChange: () => void,
) {
  if (typeof window === "undefined") return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STARTING_SCREEN_KEY) onChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STARTING_SCREEN_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STARTING_SCREEN_EVENT, onChange);
  };
}

export function getTournamentStartingPath() {
  return getTournamentStartingScreen() === "spreadsheet"
    ? "/spreadsheet"
    : "/march-madness";
}
