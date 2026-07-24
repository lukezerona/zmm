"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PoolProfile } from "./tournament-types";
import styles from "./march-madness.module.css";

export function AccountMenu({
  profile,
  onSignOut,
}: {
  profile: PoolProfile;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
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
        <span>{profile.display_name}</span>
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
            <strong>{profile.display_name}</strong>
            <span>@{profile.username}</span>
          </div>

          <fieldset className={styles.startingScreenOptions}>
            <legend>Starting screen</legend>
            <label className={styles.startingScreenOption}>
              <input
                type="radio"
                name="starting-screen"
                value="brackets"
                checked
                readOnly
              />
              <span>
                <strong>Brackets</strong>
                <small>Current default</small>
              </span>
            </label>
            <label
              className={`${styles.startingScreenOption} ${styles.disabledStartingScreen}`}
            >
              <input
                type="radio"
                name="starting-screen"
                value="spreadsheet"
                disabled
              />
              <span>
                <strong>Spreadsheet</strong>
                <small>Coming soon</small>
              </span>
            </label>
          </fieldset>

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
