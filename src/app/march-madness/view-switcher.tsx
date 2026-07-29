import Link from "next/link";
import styles from "./march-madness.module.css";

export function TournamentViewSwitcher({
  activeView,
  spreadsheetAvailable = true,
  bracketsHref = "/march-madness",
  spreadsheetHref = "/spreadsheet",
}: {
  activeView: "brackets" | "spreadsheet" | null;
  spreadsheetAvailable?: boolean;
  bracketsHref?: string;
  spreadsheetHref?: string;
}) {
  return (
    <nav className={styles.viewSwitcher} aria-label="Tournament views">
      <Link
        className={activeView === "brackets" ? styles.activeView : undefined}
        href={bracketsHref}
        aria-current={activeView === "brackets" ? "page" : undefined}
      >
        <span className={styles.desktopViewLabel}>Brackets</span>
        <span className={styles.mobileViewLabel}>Brackets</span>
      </Link>
      {spreadsheetAvailable ? (
        <Link
          className={
            activeView === "spreadsheet" ? styles.activeView : undefined
          }
          href={spreadsheetHref}
          aria-current={activeView === "spreadsheet" ? "page" : undefined}
        >
          <span className={styles.desktopViewLabel}>Spreadsheet</span>
          <span className={styles.mobileViewLabel}>Spreadsheet</span>
        </Link>
      ) : (
        <span
          className={styles.disabledView}
          aria-disabled="true"
          title="The spreadsheet opens after entries lock."
        >
          <span className={styles.desktopViewLabel}>Spreadsheet</span>
          <span className={styles.mobileViewLabel}>Spreadsheet</span>
        </span>
      )}
    </nav>
  );
}
