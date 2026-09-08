import { useState, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import {
  clampNumber,
  formatNumericValue,
  isNumericDraft,
  normaliseNumericDraft,
  parseNumericDraft,
} from "./numeric-draft";

type NumericFieldBase = {
  className?: string;
  disabled?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  group?: boolean;
  "aria-label"?: string;
};

export type NumericFieldProps = NumericFieldBase &
  (
    | {
        value: number;
        allowEmpty?: false;
        onChange: (value: number) => void;
      }
    | {
        value: number | null;
        allowEmpty: true;
        onChange: (value: number | null) => void;
      }
  );

export function NumericField(props: NumericFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const allowNegative = props.min == null || props.min < 0;
  const shown = draft ?? formatNumericValue(props.value);
  const Control = props.group ? InputGroupInput : Input;

  function commit(raw: string, emptyMeansZero: boolean): void {
    const parsed = parseNumericDraft(raw, { integer: props.integer });
    if (parsed === null) {
      if (props.allowEmpty === true) {
        props.onChange(null);
        return;
      }
      if (emptyMeansZero) {
        const fallback = clampNumber(0, props.min, props.max);
        props.onChange(fallback);
      }
      return;
    }
    const next = clampNumber(props.integer ? Math.round(parsed) : parsed, props.min, props.max);
    props.onChange(next);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>): void {
    const raw = normaliseNumericDraft(e.target.value);
    if (!isNumericDraft(raw, { integer: props.integer, allowNegative })) return;
    setDraft(raw);
    commit(raw, false);
  }

  function onFocus(): void {
    setDraft(formatNumericValue(props.value));
  }

  function onBlur(): void {
    const raw = draft ?? formatNumericValue(props.value);
    commit(raw, true);
    setDraft(null);
  }

  return (
    <Control
      type="text"
      inputMode={props.integer ? "numeric" : "decimal"}
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="done"
      className={cn("tabular-nums", props.className)}
      disabled={props.disabled}
      placeholder={props.placeholder}
      aria-label={props["aria-label"]}
      value={shown}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
