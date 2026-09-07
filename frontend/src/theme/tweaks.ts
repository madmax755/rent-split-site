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
  accent: "#007aff",
  density: "comfy",
};

export const ACCENTS = [
  { name: "Blue", v: "#007aff", dark: "#0a84ff" },
  { name: "Purple", v: "#af52de", dark: "#bf5af2" },
  { name: "Pink", v: "#ff2d55", dark: "#ff375f" },
  { name: "Orange", v: "#ff9500", dark: "#ff9f0a" },
  { name: "Green", v: "#34c759", dark: "#30d158" },
  { name: "Teal", v: "#30b0c7", dark: "#40c8e0" },
] as const;

function hexToRgba(hex: string, a: number): string {
  const m = hex.replace("#", "");
  const n = parseInt(m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

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
  root.setAttribute("data-theme", t);
  const isDark = t === "dark";
  const entry =
    ACCENTS.find((a) => a.v === tweaks.accent || a.dark === tweaks.accent) ?? ACCENTS[0];
  const accentVal = isDark ? entry.dark : entry.v;
  root.style.setProperty("--accent", accentVal);
  root.style.setProperty("--accent-soft", hexToRgba(accentVal, isDark ? 0.18 : 0.1));
  root.style.fontSize = tweaks.density === "compact" ? "14px" : "";
  const mt = document.querySelector('meta[name="theme-color"]');
  if (mt) mt.setAttribute("content", isDark ? "#000000" : "#f2f2f7");
}
