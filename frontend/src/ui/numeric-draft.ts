export type NumericDraftOptions = {
  integer?: boolean;
  allowNegative?: boolean;
};

export function normaliseNumericDraft(raw: string): string {
  return raw.replace(/,/g, ".");
}

export function isNumericDraft(raw: string, opts: NumericDraftOptions = {}): boolean {
  if (raw === "") return true;
  if (opts.allowNegative && raw === "-") return true;
  if (!opts.integer && raw === ".") return true;
  if (!opts.integer && opts.allowNegative && raw === "-.") return true;
  const pattern = opts.integer
    ? opts.allowNegative
      ? /^-?\d*$/
      : /^\d*$/
    : opts.allowNegative
      ? /^-?\d*\.?\d*$/
      : /^\d*\.?\d*$/;
  return pattern.test(raw);
}

export function parseNumericDraft(raw: string, opts: NumericDraftOptions = {}): number | null {
  if (raw === "" || raw === "-" || raw === "." || raw === "-.") return null;
  if (raw.endsWith(".")) return null;
  const n = opts.integer ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export function clampNumber(n: number, min?: number, max?: number): number {
  let out = n;
  if (min != null && out < min) out = min;
  if (max != null && out > max) out = max;
  return out;
}

export function formatNumericValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}
