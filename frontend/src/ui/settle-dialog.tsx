import { useEffect, useState } from "react";
import { money } from "../domain/format";
import { uid } from "../domain/ids";
import type { LedgerEntry } from "../domain/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { MoneyInput } from "./kit";

export type SettleRequest = {
  currency: string;
  personName: string;
  payerName: string;
  balancePence: number;
  personId: string;
};

export type SettleOutcome = {
  entry: LedgerEntry;
  announce: string;
};

type SettleDialogProps = {
  request: SettleRequest | null;
  onClose: () => void;
  onConfirm: (outcome: SettleOutcome) => void;
};

export function SettleDialog(props: SettleDialogProps) {
  const req = props.request;
  const outstanding = req ? Math.abs(Math.round(req.balancePence)) : 0;
  const [amount, setAmount] = useState<number | "">("");

  useEffect(() => {
    if (!req) return;
    setAmount(outstanding / 100);
  }, [req, outstanding]);

  if (!req) return null;

  const v = Math.round(req.balancePence);
  const direction =
    v > 0
      ? `${req.personName} pays ${req.payerName}`
      : `${req.payerName} refunds ${req.personName}`;
  const enteredPence = typeof amount === "number" ? Math.round(amount * 100) : 0;
  const valid = enteredPence > 0;
  const partial = valid && enteredPence < outstanding;
  const over = valid && enteredPence > outstanding;

  function confirm(): void {
    if (!req || !valid) return;
    const signedAmt = Math.sign(v) * enteredPence;
    const label =
      v > 0
        ? `${req.personName} paid ${req.payerName} ${money(req.currency, enteredPence)}`
        : `${req.payerName} refunded ${req.personName} ${money(req.currency, enteredPence)}`;
    props.onConfirm({
      entry: {
        id: uid("lg"),
        personId: req.personId,
        monthKey: "",
        type: "settle",
        amount: signedAmt,
        date: new Date().toISOString().slice(0, 10),
        note:
          label +
          (partial
            ? ` — partial, ${money(req.currency, outstanding - enteredPence)} left`
            : over
              ? " — more than was owed"
              : ""),
      },
      announce: partial
        ? "Partial payment recorded."
        : over
          ? "Recorded — balance flipped."
          : "Settled in full.",
    });
  }

  return (
    <Dialog
      open={!!req}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a settlement</DialogTitle>
          <DialogDescription>
            {direction}. {money(req.currency, outstanding)} is outstanding.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Amount that changed hands</FieldLabel>
          <MoneyInput currency={req.currency} value={amount} min={0.01} onChange={setAmount} />
          <FieldDescription>
            Leave the suggested amount to settle in full, or type less for a partial payment.
            {partial ? ` ${money(req.currency, outstanding - enteredPence)} will remain.` : null}
            {over ? ` That is more than was owed — the balance will flip.` : null}
          </FieldDescription>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={confirm}>
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
