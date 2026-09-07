import { initials, personColor } from "../domain/format";
import type { HouseholdState, Person } from "../domain/types";
import { cn } from "@/lib/utils";

type AvatarProps = {
  state: HouseholdState;
  person: Person | null;
  size?: number;
  className?: string;
};

export function Avatar(props: AvatarProps) {
  const size = props.size ?? 32;
  const label = props.person ? initials(props.person.name) : "?";
  const background = props.person ? personColor(props.state, props.person.id) : undefined;
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        props.className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: background ?? "var(--muted-foreground)",
      }}
    >
      {label}
    </div>
  );
}
