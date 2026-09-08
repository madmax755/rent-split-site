import { clampCycleDay, cyclePhrase, periodLabel } from "../domain/dates";
import { NumericField } from "./numeric-field";
import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/input-group";

export type CycleDayFieldProps = {
  value: number;
  monthKey: string;
  onChange: (day: number) => void;
};

export function CycleDayField(props: CycleDayFieldProps) {
  const day = clampCycleDay(props.value);
  return (
    <div className="grid gap-1.5">
      <InputGroup className="w-full">
        <InputGroupAddon>
          <InputGroupText>the</InputGroupText>
        </InputGroupAddon>
        <NumericField
          group
          integer
          min={1}
          max={31}
          value={day}
          aria-label="Billing period start day"
          onChange={(v) => {
            props.onChange(clampCycleDay(v));
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>of each month</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <p className="text-xs text-muted-foreground">
        {cyclePhrase(day)} · {periodLabel(props.monthKey, day)}
      </p>
    </div>
  );
}
