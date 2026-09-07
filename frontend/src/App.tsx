import { useEffect } from "react";
import { startLegacyApp } from "./legacy/boot";

/**
 * React shell. The existing UI currently runs through a legacy bridge
 * (`src/legacy/`) so behaviour stays intact while new work lands as
 * proper React components under `src/`.
 */
export function App() {
  useEffect(() => {
    startLegacyApp();
  }, []);

  return null;
}
