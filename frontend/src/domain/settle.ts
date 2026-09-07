import { money } from "./format";
import { uid } from "./ids";
import type { LedgerEntry } from "./types";

export type SettlePromptResult =
  | { kind: "cancel" }
  | { kind: "invalid"; message: string }
  | { kind: "ok"; entry: LedgerEntry; announce: string };

export function promptSettlement(opts: {
  currency: string;
  personName: string;
  payerName: string;
  balancePence: number;
  personId: string;
}): SettlePromptResult {
  const v = Math.round(opts.balancePence);
  if (!v) return { kind: "invalid", message: "Nothing to settle." };
  const owedNow = Math.abs(v);
  const direction =
    v > 0 ? `${opts.personName} pays ${opts.payerName}` : `${opts.payerName} refunds ${opts.personName}`;
  const raw = prompt(
    `${direction} — how much changed hands?\n\n${money(opts.currency, owedNow)} is currently outstanding. Leave this as it is to settle in full, or enter a smaller amount to record a partial payment.`,
    (owedNow / 100).toFixed(2),
  );
  if (raw === null) return { kind: "cancel" };
  const entered = Math.round(parseFloat(raw) * 100);
  if (!Number.isFinite(entered) || entered <= 0) {
    return { kind: "invalid", message: "Enter an amount greater than zero." };
  }
  const signedAmt = Math.sign(v) * entered;
  const partial = entered < owedNow;
  const over = entered > owedNow;
  const label =
    v > 0
      ? `${opts.personName} paid ${opts.payerName} ${money(opts.currency, entered)}`
      : `${opts.payerName} refunded ${opts.personName} ${money(opts.currency, entered)}`;
  let msg = `Record: ${label}.`;
  if (partial) {
    msg += ` ${money(opts.currency, owedNow - entered)} will still be ${v > 0 ? "owed" : "due back"} afterwards.`;
  }
  if (over) {
    msg += ` That is more than was outstanding — the balance will flip, and ${v > 0 ? `${opts.payerName} will owe ${opts.personName}` : `${opts.personName} will owe ${opts.payerName}`} ${money(opts.currency, entered - owedNow)}.`;
  }
  if (!confirm(msg)) return { kind: "cancel" };
  return {
    kind: "ok",
    entry: {
      id: uid("lg"),
      personId: opts.personId,
      monthKey: "",
      type: "settle",
      amount: signedAmt,
      date: new Date().toISOString().slice(0, 10),
      note:
        label +
        (partial
          ? ` — partial, ${money(opts.currency, owedNow - entered)} left`
          : over
            ? " — more than was owed"
            : ""),
    },
    announce: partial
      ? "Partial payment recorded."
      : over
        ? "Recorded — balance flipped."
        : "Settled in full.",
  };
}
