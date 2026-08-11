/**
 * OS side rail + Fortell note-mode coordination.
 * Note mode collapses the rail to icons; expand is explicit or note mode off.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type OsRailContextValue = {
  noteMode: boolean;
  setNoteMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  /** User pinned the rail open while in note mode. */
  railPinnedExpanded: boolean;
  setRailPinnedExpanded: (value: boolean) => void;
  /** Icons-only: note mode without pinned expand. */
  railCollapsed: boolean;
};

const OsRailContext = createContext<OsRailContextValue | null>(null);

export function OsRailProvider({ children }: { children: ReactNode }) {
  const [noteMode, setNoteModeState] = useState(false);
  const [railPinnedExpanded, setRailPinnedExpanded] = useState(false);

  const setNoteMode = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setNoteModeState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        if (!next) setRailPinnedExpanded(false);
        return next;
      });
    },
    [],
  );

  const value = useMemo<OsRailContextValue>(
    () => ({
      noteMode,
      setNoteMode,
      railPinnedExpanded,
      setRailPinnedExpanded,
      railCollapsed: noteMode && !railPinnedExpanded,
    }),
    [noteMode, setNoteMode, railPinnedExpanded],
  );

  return (
    <OsRailContext.Provider value={value}>{children}</OsRailContext.Provider>
  );
}

export function useOsRail(): OsRailContextValue {
  const ctx = useContext(OsRailContext);
  if (!ctx) {
    throw new Error("useOsRail must be used within OsRailProvider");
  }
  return ctx;
}

/** Safe for surfaces that may render outside the OS shell. */
export function useOsRailOptional(): OsRailContextValue | null {
  return useContext(OsRailContext);
}
