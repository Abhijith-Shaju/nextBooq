export function stepPartySize(current: number, direction: 1 | -1, max: number, min = 1): number {
  const next = current + direction;
  return Math.min(max, Math.max(min, next));
}
