import Link from "next/link";
import styles from "./march-madness.module.css";

export function TournamentViewSwitcher({
  activeView,
  spreadsheetAvailable = true,
}: {
  activeView: "brackets" | "spreadsheet" | "history";
  spreadsheetAvailable?: boolean;
}) {
  return (
    <nav className={styles.viewSwitcher} aria-label="Tournament views">
      <Link
        className={activeView === "brackets" ? styles.activeView : undefined}
        href="/march-madness"
        aria-current={activeView === "brackets" ? "page" : undefined}
      >
        <span className={styles.desktopViewLabel}>Tournament</span>
        <span className={styles.mobileViewLabel}>Current</span>
      </Link>
      {spreadsheetAvailable ? (
        <Link
          className={
            activeView === "spreadsheet" ? styles.activeView : undefined
          }
          href="/spreadsheet"
          aria-current={activeView === "spreadsheet" ? "page" : undefined}
        >
          <span className={styles.desktopViewLabel}>Spreadsheet</span>
          <span className={styles.mobileViewLabel}>Sheet</span>
        </Link>
      ) : (
        <span
          className={styles.disabledView}
          aria-disabled="true"
          title="The spreadsheet opens after entries lock."
        >
          <span className={styles.desktopViewLabel}>Spreadsheet</span>
          <span className={styles.mobileViewLabel}>Sheet</span>
        </span>
      )}
      <Link
        className={activeView === "history" ? styles.activeView : undefined}
        href="/history"
        aria-current={activeView === "history" ? "page" : undefined}
      >
        History
      </Link>
    </nav>
  );
}
