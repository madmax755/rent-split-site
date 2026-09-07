import { LS } from "../storage/browser-storage";

export type ThemeMode = "light" | "dark" | "auto";
export type Density = "comfy" | "compact";

export type Tweaks = {
  theme: ThemeMode;
  accent: string;
  density: Density;
};

export const TWEAKS_DEFAULTS: Tweaks = {
  theme: "auto",
  accent: "#0f766e",
  density: "comfy",
};

export const ACCENTS = [
  { name: "Teal", v: "#0f766e", dark: "#2dd4bf" },
  { name: "Ink", v: "#1c1917", dark: "#e7e5e4" },
  { name: "Blue", v: "#1d4ed8", dark: "#60a5fa" },
  { name: "Violet", v: "#6d28d9", dark: "#c4b5fd" },
  { name: "Orange", v: "#c2410c", dark: "#fb923c" },
  { name: "Rose", v: "#be123c", dark: "#fb7185" },
] as const;

export function loadTweaks(): Tweaks {
  try {
    return { ...TWEAKS_DEFAULTS, ...(JSON.parse(LS.get("rs-tweaks") || "{}") as Partial<Tweaks>) };
  } catch {
    return { ...TWEAKS_DEFAULTS };
  }
}

export function saveTweaks(tweaks: Tweaks): void {
  LS.set("rs-tweaks", JSON.stringify(tweaks));
}

export function resolvedTheme(tweaks: Tweaks): "light" | "dark" {
  if (tweaks.theme === "auto") {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return tweaks.theme;
}

export function applyTheme(tweaks: Tweaks): void {
  const root = document.documentElement;
  const t = resolvedTheme(tweaks);
  root.classList.toggle("dark", t === "dark");
  root.setAttribute("data-theme", t);
  root.setAttribute("data-density", tweaks.density);
  const isDark = t === "dark";
  const entry =
    ACCENTS.find((a) => a.v === tweaks.accent || a.dark === tweaks.accent) ?? ACCENTS[0];
  const accentVal = isDark ? entry.dark : entry.v;
  root.style.setProperty("--primary", accentVal);
  root.style.setProperty("--ring", accentVal);
  root.style.setProperty("--sidebar-primary", accentVal);
  root.style.setProperty("--sidebar-ring", accentVal);
  root.style.setProperty("--primary-foreground", isDark ? "#0a1f1c" : "#f7fffc");
  root.style.setProperty("--sidebar-primary-foreground", isDark ? "#0a1f1c" : "#f7fffc");
  const mt = document.querySelector('meta[name="theme-color"]');
  if (mt) mt.setAttribute("content", isDark ? "#2a211c" : "#f7f3ea");
}
