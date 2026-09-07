import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { HouseholdState } from "../domain/types";
import { HouseholdStore } from "./household-store";

const StoreContext = createContext<HouseholdStore | null>(null);

export function HouseholdProvider(props: { store: HouseholdStore; children: ReactNode }) {
  return <StoreContext.Provider value={props.store}>{props.children}</StoreContext.Provider>;
}

export function useStore(): HouseholdStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("HouseholdProvider is missing");
  return store;
}

export function useHousehold(): { store: HouseholdStore; state: HouseholdState; version: number } {
  const store = useStore();
  const version = useSyncExternalStore(store.subscribe, () => store.version, () => store.version);
  return { store, state: store.state, version };
}
