import { clampCycleDay, cyclePhrase, periodLabel } from "../domain/dates";
import { NumericField } from "./numeric-field";

export type CycleDayFieldProps = {
  value: number;
  monthKey: string;
  onChange: (day: number) => void;
};

export function CycleDayField(props: CycleDayFieldProps) {
  const day = clampCycleDay(props.value);
  return (
    <div>
      <div className="field compact" style={{ width: 188 }}>
        <span className="prefix">the</span>
        <NumericField
          integer
          min={1}
          max={31}
          className="num-input"
          value={day}
          aria-label="Billing period start day"
          onChange={(v) => {
            props.onChange(clampCycleDay(v));
          }}
        />
        <span className="suffix">of each month</span>
      </div>
      <div className="helper" style={{ marginTop: 4, marginBottom: 0 }}>
        {cyclePhrase(day)} · {periodLabel(props.monthKey, day)}
      </div>
    </div>
  );
}
