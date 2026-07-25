import Link from "next/link";
import styles from "./march-madness.module.css";

export function TournamentViewSwitcher({
  activeView,
}: {
  activeView: "brackets" | "spreadsheet";
}) {
  return (
    <nav className={styles.viewSwitcher} aria-label="Tournament views">
      <Link
        className={activeView === "brackets" ? styles.activeView : undefined}
        href="/march-madness"
        aria-current={activeView === "brackets" ? "page" : undefined}
      >
        Brackets
      </Link>
      <Link
        className={activeView === "spreadsheet" ? styles.activeView : undefined}
        href="/spreadsheet"
        aria-current={activeView === "spreadsheet" ? "page" : undefined}
      >
        Spreadsheet
      </Link>
    </nav>
  );
}
