import { useState, type FormEvent, type ReactNode } from "react";
import {
  BookOpenIcon,
  CalendarDaysIcon,
  HistoryIcon,
  HomeIcon,
  HouseIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  ScaleIcon,
  SettingsIcon,
  SunIcon,
  UsersIcon,
} from "lucide-react";
import { computeBalances, monthAllActual } from "../domain/engine";
import { ensureMonth } from "../domain/months";
import type { TabId } from "../domain/types";
import { useHousehold } from "../store/household-context";
import { resolvedTheme, type Tweaks } from "../theme/tweaks";
import { SIGN_OUT_REQUEST, useConfirm } from "./confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type AppShellProps = {
  children: ReactNode;
  tweaks: Tweaks;
  onTweaks: (t: Tweaks) => void;
  loginOpen: boolean;
  loginError: string;
  onLogin: (username: string, password: string) => Promise<void>;
  onLogout: () => void;
  toast: string;
};

type NavItem = {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: ReactNode;
  group: "work" | "house" | "help";
};

const NAV: NavItem[] = [
  { id: "home", label: "Home", shortLabel: "Home", icon: <HomeIcon />, group: "work" },
  {
    id: "month",
    label: "This month",
    shortLabel: "Month",
    icon: <CalendarDaysIcon />,
    group: "work",
  },
  { id: "stints", label: "Who's here", shortLabel: "Here", icon: <UsersIcon />, group: "work" },
  { id: "balances", label: "Settle", shortLabel: "Settle", icon: <ScaleIcon />, group: "work" },
  { id: "history", label: "History", shortLabel: "History", icon: <HistoryIcon />, group: "work" },
  { id: "setup", label: "Household", shortLabel: "House", icon: <HouseIcon />, group: "house" },
  {
    id: "settings",
    label: "Settings",
    shortLabel: "Settings",
    icon: <SettingsIcon />,
    group: "house",
  },
  { id: "how", label: "How it works", shortLabel: "Help", icon: <BookOpenIcon />, group: "help" },
];

export function AppShell(props: AppShellProps) {
  const { store, state, activeTab } = useHousehold();
  const ask = useConfirm();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const tenant = store.isTenant();
  const visible = NAV.filter((item) => (tenant ? tenantTabs.has(item.id) : item.id !== "home"));
  const work = visible.filter((item) => item.group === "work");
  const house = visible.filter((item) => item.group === "house");
  const help = visible.filter((item) => item.group === "help");
  const mobilePrimary = tenant
    ? visible.filter(
        (item) =>
          item.id === "home" ||
          item.id === "month" ||
          item.id === "stints" ||
          item.id === "balances",
      )
    : visible.filter(
        (item) =>
          item.id === "month" ||
          item.id === "stints" ||
          item.id === "balances" ||
          item.id === "setup",
      );

  const M = ensureMonth(state, state.currentMonth);
  const needsBills = M.collected && !monthAllActual(state, M);
  const { bal } = computeBalances(state);
  const anyBalance = Object.values(bal).some((v) => Math.abs(v) >= 1);
  const noStints = !(M.stints || []).length;
  const shared = store.adapter.shared;
  const bad = !!store.lastError;
  const syncLabel = bad
    ? store.lastError
    : shared
      ? store.dirty
        ? "Saving…"
        : "Saved"
      : "Saved on this device";
  const dark = resolvedTheme(props.tweaks) === "dark";

  function tabAlert(id: TabId): boolean {
    switch (id) {
      case "home":
        return anyBalance;
      case "month":
        return needsBills;
      case "stints":
        return noStints;
      case "balances":
        return anyBalance;
      case "history":
      case "setup":
      case "settings":
      case "how":
        return false;
      default: {
        const _exhaustive: never = id;
        void _exhaustive;
        return false;
      }
    }
  }

  async function signOut(): Promise<void> {
    if (!(await ask(SIGN_OUT_REQUEST))) return;
    props.onLogout();
  }

  function go(id: TabId): void {
    store.setTab(id);
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitLogin(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSigningIn(true);
    try {
      await props.onLogin(username, password);
    } finally {
      setSigningIn(false);
    }
  }

  if (props.loginOpen) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-5">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Rent Split
            </p>
            <h1 className="font-heading mt-1 text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the username the household admin gave you.
            </p>
          </div>
          <form className="grid gap-3" onSubmit={(e) => void submitLogin(e)} autoComplete="on">
            <div className="grid gap-1.5">
              <Label htmlFor="login-user">Username</Label>
              <Input
                id="login-user"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="login-pass">Password</Label>
              <Input
                id="login-pass"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {props.loginError ? (
              <p className="text-sm text-destructive">{props.loginError}</p>
            ) : null}
            <Button type="submit" disabled={signingIn} className="mt-1 w-full">
              {signingIn ? "Checking…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh lg:flex">
      <aside
        data-print-hide
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex"
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            RS
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Rent Split</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {state.activePresetName || "Household"}
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
          <NavGroup title="Work" items={work} active={activeTab} alert={tabAlert} onGo={go} />
          {house.length ? (
            <NavGroup
              title="The house"
              items={house}
              active={activeTab}
              alert={tabAlert}
              onGo={go}
            />
          ) : null}
          <NavGroup title="Help" items={help} active={activeTab} alert={tabAlert} onGo={go} />
        </nav>
        <div className="mt-auto grid gap-2 border-t px-3 py-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">
                {store.session && store.session.accountId !== "local"
                  ? store.session.username
                  : "This browser"}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {store.session?.role === "admin"
                  ? "Admin"
                  : store.session?.role === "tenant"
                    ? "Tenant"
                    : syncLabel}
                {store.session?.role ? ` · ${syncLabel}` : ""}
              </div>
            </div>
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                bad
                  ? "bg-amber-500"
                  : shared && !store.dirty
                    ? "bg-emerald-500"
                    : "bg-muted-foreground/40",
              )}
              title={syncLabel}
            />
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-start"
              title={dark ? "Switch to light" : "Switch to dark"}
              onClick={() => {
                props.onTweaks({
                  ...props.tweaks,
                  theme: dark ? "light" : "dark",
                });
              }}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
              {dark ? "Light" : "Dark"}
            </Button>
            {store.adapter.logout ? (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Sign out"
                onClick={() => void signOut()}
              >
                <LogOutIcon />
              </Button>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header
          data-print-hide
          className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background/85 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl lg:hidden"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
            RS
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">Rent Split</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {pageTitle(activeTab, tenant)}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            title={dark ? "Switch to light" : "Switch to dark"}
            onClick={() => {
              props.onTweaks({
                ...props.tweaks,
                theme: dark ? "light" : "dark",
              });
            }}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </Button>
        </header>
        {props.children}
      </div>

      <nav
        data-print-hide
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
      >
        <div className="grid grid-cols-5">
          {mobilePrimary.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "relative flex min-h-12 touch-manipulation flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium",
                activeTab === item.id ? "text-primary" : "text-muted-foreground",
              )}
              onClick={() => go(item.id)}
            >
              <span className="[&_svg]:size-5">{item.icon}</span>
              <span className="max-w-full truncate">{item.shortLabel}</span>
              {tabAlert(item.id) ? (
                <span className="absolute top-1 right-1/4 size-1.5 rounded-full bg-amber-500" />
              ) : null}
            </button>
          ))}
          <button
            type="button"
            className={cn(
              "flex min-h-12 touch-manipulation flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium",
              moreOpen || !mobilePrimary.some((item) => item.id === activeTab)
                ? "text-primary"
                : "text-muted-foreground",
            )}
            onClick={() => setMoreOpen(true)}
          >
            <MenuIcon className="size-5" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription>History, settings and how the split works.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-1 px-4 pb-6">
            {visible
              .filter((item) => !mobilePrimary.some((p) => p.id === item.id))
              .map((item) => (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? "secondary" : "ghost"}
                  className="justify-start"
                  onClick={() => go(item.id)}
                >
                  {item.icon}
                  {item.label}
                </Button>
              ))}
            <Separator className="my-2" />
            {store.adapter.logout ? (
              <Button
                variant="ghost"
                className="justify-start text-destructive"
                onClick={() => void signOut()}
              >
                <LogOutIcon />
                Sign out
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg transition lg:bottom-6",
          props.toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        {props.toast}
      </div>
    </div>
  );
}

const tenantTabs = new Set<TabId>(["home", "month", "stints", "history", "balances", "how"]);

type NavGroupProps = {
  title: string;
  items: NavItem[];
  active: TabId;
  alert: (id: TabId) => boolean;
  onGo: (id: TabId) => void;
};

function NavGroup(props: NavGroupProps) {
  if (!props.items.length) return null;
  return (
    <div>
      <div className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {props.title}
      </div>
      <div className="grid gap-0.5">
        {props.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium transition-colors",
              props.active === item.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
            onClick={() => props.onGo(item.id)}
          >
            <span className="[&_svg]:size-4">{item.icon}</span>
            <span className="flex-1 truncate">{item.label}</span>
            {props.alert(item.id) ? <span className="size-1.5 rounded-full bg-amber-500" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function pageTitle(tab: TabId, tenant: boolean): string {
  switch (tab) {
    case "home":
      return "Home";
    case "month":
      return "This month";
    case "stints":
      return "Who's here";
    case "balances":
      return tenant ? "Settle" : "Settle";
    case "history":
      return "History";
    case "setup":
      return "Household";
    case "settings":
      return "Settings";
    case "how":
      return "How it works";
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}
