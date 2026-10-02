import type { Stint } from "./types";

function covers(stint: Stint, day: number): boolean {
  return day >= stint.from && day <= stint.to;
}

function punchDay(stint: Stint, day: number, newId: () => string): Stint[] {
  if (!covers(stint, day)) return [stint];
  if (stint.from === day && stint.to === day) return [];
  if (stint.from === day) return [{ ...stint, from: day + 1 }];
  if (stint.to === day) return [{ ...stint, to: day - 1 }];
  return [
    { ...stint, to: day - 1 },
    { ...stint, id: newId(), from: day + 1 },
  ];
}

function nearestRoom(stints: readonly Stint[], day: number, fallback: string): string {
  let bestRoom = fallback;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestIsBefore = false;
  for (const stint of stints) {
    if (!stint.roomId) continue;
    const before = day > stint.to;
    const distance = before ? day - stint.to : stint.from - day;
    const closer = distance < bestDistance;
    const tiePreferEarlierStay = distance === bestDistance && before && !bestIsBefore;
    if (closer || tiePreferEarlierStay) {
      bestDistance = distance;
      bestRoom = stint.roomId;
      bestIsBefore = before;
    }
  }
  return bestRoom;
}

export function togglePersonDay(
  stints: readonly Stint[],
  personId: string,
  day: number,
  periodLength: number,
  roomId: string,
  newId: () => string,
): Stint[] {
  if (!Number.isInteger(day) || day < 1 || day > periodLength) return stints.slice();

  const here = stints.some((stint) => stint.personId === personId && covers(stint, day));
  if (here) {
    return stints.flatMap((stint) =>
      stint.personId === personId ? punchDay(stint, day, newId) : [stint],
    );
  }

  const mine = stints.filter((stint) => stint.personId === personId);
  const left = [...mine].reverse().find((stint) => stint.to === day - 1);
  const rightMatches = mine.filter((stint) => stint.from === day + 1);
  const right =
    (left ? rightMatches.find((stint) => stint.roomId === left.roomId) : undefined) ??
    rightMatches[0];

  if (left && right && left.roomId === right.roomId) {
    return stints.flatMap((stint) => {
      if (stint.id === right.id) return [];
      if (stint.id === left.id) return [{ ...stint, to: right.to }];
      return [stint];
    });
  }

  if (left) {
    return stints.map((stint) => (stint.id === left.id ? { ...stint, to: day } : stint));
  }

  if (right) {
    return stints.map((stint) => (stint.id === right.id ? { ...stint, from: day } : stint));
  }

  return insertStint(stints, {
    id: newId(),
    personId,
    roomId: nearestRoom(mine, day, roomId),
    from: day,
    to: day,
  });
}

function insertStint(stints: readonly Stint[], created: Stint): Stint[] {
  const next = stints.slice();
  let insertAt = next.length;
  for (let index = 0; index < next.length; index++) {
    const stint = next[index];
    if (stint && stint.personId === created.personId && stint.from > created.from) {
      insertAt = index;
      break;
    }
  }
  if (insertAt === next.length) {
    for (let index = next.length - 1; index >= 0; index--) {
      if (next[index]?.personId === created.personId) {
        insertAt = index + 1;
        break;
      }
    }
  }
  next.splice(insertAt, 0, created);
  return next;
}
