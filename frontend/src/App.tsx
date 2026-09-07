import { useEffect, useState } from "react";
import { todayKey } from "./domain/dates";
import { ensureMonth } from "./domain/months";
import { normalise } from "./domain/normalise";
import { HouseholdProvider, useHousehold } from "./store/household-context";
import { HouseholdStore } from "./store/household-store";
import { applyTheme, loadTweaks, saveTweaks, type Tweaks } from "./theme/tweaks";
import { BalancesScreen } from "./ui/balances-screen";
import { HistoryScreen } from "./ui/history-screen";
import { HowScreen } from "./ui/how-screen";
import { MonthScreen } from "./ui/month-screen";
import { SettingsScreen } from "./ui/settings-screen";
import { SetupScreen } from "./ui/setup-screen";
import { AppShell } from "./ui/shell";
import { StintsScreen } from "./ui/stints-screen";
import {
  TenantBalancesScreen,
  TenantHistoryScreen,
  TenantHomeScreen,
  TenantMonthScreen,
} from "./ui/tenant-screens";

export function App() {
  const [store] = useState(() => new HouseholdStore());
  return (
    <HouseholdProvider store={store}>
      <RentSplitApp store={store} />
    </HouseholdProvider>
  );
}

type RentSplitAppProps = {
  store: HouseholdStore;
};

function RentSplitApp(_props: RentSplitAppProps) {
  const { store } = useHousehold();
  const [tweaks, setTweaks] = useState<Tweaks>(() => loadTweaks());
  const [toast, setToast] = useState("");
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    applyTheme(tweaks);
    saveTweaks(tweaks);
  }, [tweaks]);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (tweaks.theme === "auto") applyTheme(tweaks);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [tweaks]);

  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    store.setToast((msg) => {
      setToast(msg);
      clearTimeout(hide);
      hide = setTimeout(() => setToast(""), 2600);
    });
    return () => clearTimeout(hide);
  }, [store]);

  useEffect(() => {
    void boot(store).then(() => setBooted(true));
  }, [store]);

  function toggleSection(id: string): void {
    store.mutate(() => {
      store.state.sectionsOpen[id] = !store.state.sectionsOpen[id];
    });
  }

  async function onLogin(username: string, password: string): Promise<void> {
    setLoginError("");
    const login = store.adapter.login;
    if (!login) return;
    const session = await login(username, password);
    if (!session) {
      setLoginError("That username or password didn't work.");
      return;
    }
    store.needAuth = false;
    store.applySession(session);
    const data = await store.loadRaw();
    if (data) store.applyHydrate(data);
    ensureMonth(store.state, store.state.currentMonth);
    if (store.isTenant()) store.state.activeTab = "home";
    store.saveLocal();
    store.startPolling();
    store.notifyPublic();
    store.announce("Signed in.");
  }

  async function exportBackup(): Promise<void> {
    const data = JSON.stringify(store.envelope(), null, 2);
    const filename = `rent-split-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      store.announce("Backup downloaded.");
    } catch {
      try {
        await navigator.clipboard.writeText(data);
        store.announce("Download blocked — the backup is on your clipboard instead.");
      } catch {
        store.announce("Couldn't export.");
      }
    }
  }

  function onImport(): void {
    let o: unknown;
    try {
      o = JSON.parse(importText);
    } catch {
      store.announce("That isn't valid data.");
      return;
    }
    if (!confirm("Replace everything currently on screen with this backup?")) return;
    const result = store.importPayload(o);
    if (result === "tooNew") {
      alert(store.loadNote);
      return;
    }
    if (result === "unrecognised") {
      store.announce("Couldn't recognise that data.");
      return;
    }
    store.announce("Restored.");
    setShowImport(false);
  }

  if (!booted) return null;

  return (
    <AppShell
      tweaks={tweaks}
      onTweaks={setTweaks}
      loginOpen={store.needAuth}
      loginError={loginError}
      onLogin={onLogin}
      onLogout={() => {
        void store.adapter.logout?.().then(() => location.reload());
      }}
      toast={toast}
      propertyOpen={propertyOpen}
      setPropertyOpen={setPropertyOpen}
    >
      {store.isTenant() ? (
        <>
          <TenantHomeScreen onToggleSection={toggleSection} />
          <TenantMonthScreen onToggleSection={toggleSection} />
          <StintsScreen onToggleSection={toggleSection} />
          <TenantHistoryScreen />
          <TenantBalancesScreen />
          <HowScreen />
        </>
      ) : (
        <>
          <MonthScreen onToggleSection={toggleSection} />
          <StintsScreen onToggleSection={toggleSection} />
          <BalancesScreen onToggleSection={toggleSection} />
          <HistoryScreen onToggleSection={toggleSection} />
          <SetupScreen onToggleSection={toggleSection} />
          <SettingsScreen
            onToggleSection={toggleSection}
            tweaks={tweaks}
            onTweaks={setTweaks}
            showImport={showImport}
            setShowImport={setShowImport}
            importText={importText}
            setImportText={setImportText}
            onExport={() => void exportBackup()}
            onImport={onImport}
            onReset={() => {
              if (
                !confirm(
                  "Reset everything — people, rooms, bills, every month and every balance — back to defaults? Saved properties are kept.",
                )
              )
                return;
              store.resetToDefaults();
            }}
            onPush={() => {
              void store
                .push()
                .then(() => store.announce("Saved and shared."))
                .catch((e: unknown) => {
                  store.announce(
                    "Couldn't share: " + (e instanceof Error ? e.message : "unknown error"),
                  );
                });
            }}
            onLogout={() => {
              void store.adapter.logout?.().then(() => location.reload());
            }}
          />
          <HowScreen />
        </>
      )}
    </AppShell>
  );
}

async function boot(store: HouseholdStore): Promise<void> {
  await store.init();
  if (store.needAuth) {
    normalise(store.state);
    ensureMonth(store.state, store.state.currentMonth);
    store.notifyPublic();
    return;
  }
  const saved = await store.loadRaw();
  let changed = false;
  const res = saved ? store.applyHydrate(saved) : { outcome: false as const, changed: false };
  if (res.outcome === "tooNew") {
    store.readOnly = true;
    setTimeout(
      () => store.announce("Saved by a newer version — nothing loaded, nothing overwritten."),
      700,
    );
  } else if (res.outcome === true) {
    changed = res.changed;
  } else {
    changed = true;
    normalise(store.state);
    store.state.currentMonth = store.state.currentMonth || todayKey();
    ensureMonth(store.state, store.state.currentMonth);
  }
  ensureMonth(store.state, store.state.currentMonth);
  if (store.isTenant()) {
    const allowed = new Set(["home", "month", "stints", "history", "balances", "how"]);
    if (!allowed.has(store.state.activeTab)) store.state.activeTab = "home";
  }
  if (!store.readOnly && !store.isTenant()) {
    if (changed) store.save();
    else store.saveLocal();
  }
  store.startPolling();
  store.notifyPublic();
}
