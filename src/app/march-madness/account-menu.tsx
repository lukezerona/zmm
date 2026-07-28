"use client";

import Link from "next/link";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getTournamentStartingScreen,
  setTournamentStartingScreen,
  subscribeToTournamentStartingScreen,
} from "@/lib/tournament-preference";
import { PoolProfile } from "./tournament-types";
import styles from "./march-madness.module.css";

export function AccountMenu({
  profile,
  isCommissioner,
  commissionerReturnTo = "/march-madness",
  commissionerShortcutVisible = false,
  onSignOut,
}: {
  profile: PoolProfile;
  isCommissioner?: boolean;
  commissionerReturnTo?: string;
  commissionerShortcutVisible?: boolean;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const startingScreen = useSyncExternalStore(
    subscribeToTournamentStartingScreen,
    getTournamentStartingScreen,
    () => "brackets",
  );
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.accountMenu} ref={menuRef}>
      <button
        className={`${styles.accountTrigger} ${
          open ? styles.accountTriggerOpen : ""
        }`}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="account-menu-panel"
      >
        <span>@{profile.username}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>

      {open && (
        <div
          className={styles.accountPanel}
          id="account-menu-panel"
          role="dialog"
          aria-label="Account settings"
        >
          <div className={styles.accountIdentity}>
            <strong>Account</strong>
            <span>@{profile.username}</span>
          </div>

          <fieldset className={styles.startingScreenOptions}>
            <legend>Starting screen</legend>
            <label className={styles.startingScreenOption}>
              <input
                type="radio"
                name="starting-screen"
                value="brackets"
                checked={startingScreen === "brackets"}
                onChange={() => setTournamentStartingScreen("brackets")}
              />
              <span>
                <strong>Brackets</strong>
                <small>Open brackets after sign-in</small>
              </span>
            </label>
            <label className={styles.startingScreenOption}>
              <input
                type="radio"
                name="starting-screen"
                value="spreadsheet"
                checked={startingScreen === "spreadsheet"}
                onChange={() => setTournamentStartingScreen("spreadsheet")}
              />
              <span>
                <strong>Spreadsheet</strong>
                <small>Open spreadsheet after sign-in</small>
              </span>
            </label>
          </fieldset>

          {isCommissioner && (
            <Link
              className={`${styles.commissionerLink} ${
                commissionerShortcutVisible
                  ? styles.commissionerMenuMobileOnly
                  : ""
              }`}
              href={{
                pathname: "/commissioner",
                query: { returnTo: commissionerReturnTo },
              }}
              onClick={() => setOpen(false)}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Commissioner
            </Link>
          )}

          <button
            className={styles.accountSignOut}
            type="button"
            onClick={() => {
              setOpen(false);
              void onSignOut();
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
