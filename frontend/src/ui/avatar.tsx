import { initials, personColor } from "../domain/format";
import type { HouseholdState, Person } from "../domain/types";

type AvatarProps = {
  state: HouseholdState;
  person: Person | null;
  size?: number;
};

export function Avatar(props: AvatarProps) {
  const size = props.size ?? 30;
  if (!props.person) {
    return (
      <div
        className="avatar"
        style={{
          background: "var(--muted-2)",
          width: size,
          height: size,
          fontSize: Math.round(size * 0.4),
        }}
      >
        ?
      </div>
    );
  }
  return (
    <div
      className="avatar"
      style={{
        background: personColor(props.state, props.person.id),
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initials(props.person.name)}
    </div>
  );
}
