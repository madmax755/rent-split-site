import { clampCycleDay, cyclePhrase, periodLabel } from "../domain/dates";

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
        <input
          type="number"
          min={1}
          max={31}
          className="num-input"
          value={day}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            props.onChange(Number.isFinite(v) ? clampCycleDay(v) : 1);
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
