import { clampCycleDay, cyclePhrase, periodLabel } from "../domain/dates";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

export type CycleDayFieldProps = {
  value: number;
  monthKey: string;
  onChange: (day: number) => void;
};

export function CycleDayField(props: CycleDayFieldProps) {
  const day = clampCycleDay(props.value);
  return (
    <div className="grid gap-1.5">
      <InputGroup className="w-[220px]">
        <InputGroupAddon>
          <InputGroupText>the</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          type="number"
          min={1}
          max={31}
          className="tabular"
          value={day}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            props.onChange(Number.isFinite(v) ? clampCycleDay(v) : 1);
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
