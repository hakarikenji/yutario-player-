/**
 * useBackClose — registers an overlay/screen with the global back stack
 * while `active` is true. The close callback is kept fresh via ref, so
 * callers may pass inline closures without re-registering every render.
 */
import { useEffect, useRef } from "react";
import { pushBackHandler, popBackHandler } from "../lib/backStack";

export function useBackClose(active: boolean, id: string, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!active) return;
    pushBackHandler(id, () => closeRef.current());
    return () => popBackHandler(id);
  }, [active, id]);
}
