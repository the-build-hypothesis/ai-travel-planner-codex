import type { Day } from "./schema";
// Explicit day-scoped requests preserve all other saved days byte-for-byte.
export function scopeRequestedDay(message: string, days: Day[]): number | null {
  const words = [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
    "twenty",
  ];
  const matches = [
    ...message
      .toLowerCase()
      .matchAll(
        /\bday\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g,
      ),
  ];
  if (
    matches.length !== 1 ||
    /\b(all days|every day|whole trip|entire trip|other days|days?\s+\d+\s*(?:and|to|through|[-–])\s*\d+)\b/.test(
      message.toLowerCase(),
    )
  )
    return null;
  const value = Number(matches[0][1]) || words.indexOf(matches[0][1]) + 1;
  return value >= 1 && value <= days.length ? value - 1 : null;
}
export function preserveOtherDays(
  saved: Day[],
  generated: Day[],
  scope: number | null,
): Day[] {
  if (scope === null) return generated;
  const target =
    generated.find((d) => d.id === saved[scope].id) ||
    generated[scope] ||
    (generated.length === 1 ? generated[0] : undefined);
  if (!target) return saved;
  return saved.map((d, i) => (i === scope ? { ...target, id: d.id } : d));
}
