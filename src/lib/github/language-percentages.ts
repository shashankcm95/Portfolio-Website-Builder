/**
 * Convert GitHub's `/languages` byte-count map into a rendered breakdown.
 *
 * GitHub returns `{ "TypeScript": 12345, "JavaScript": 678, ... }` as raw
 * source-code bytes. We:
 *   1. Drop zero-byte entries.
 *   2. Sort by bytes desc.
 *   3. Compute percentages as floats, then round so the *displayed*
 *      percentages sum to 100 (largest-remainder method — avoids the
 *      classic "99%" rounding artifact).
 */
export function toLanguageBreakdown(
  raw: Record<string, number>
): Array<{ name: string; bytes: number; pct: number }> {
  const entries = Object.entries(raw).filter(([, bytes]) => bytes > 0);
  if (entries.length === 0) return [];

  const total = entries.reduce((sum, [, b]) => sum + b, 0);
  if (total === 0) return [];

  // Sort by raw bytes desc for stable display order.
  entries.sort((a, b) => b[1] - a[1]);

  // Compute raw percentages + floor; track remainders.
  const floored = entries.map(([name, bytes]) => {
    const rawPct = (bytes / total) * 100;
    const floor = Math.floor(rawPct);
    return {
      name,
      bytes,
      floor,
      remainder: rawPct - floor,
    };
  });

  const flooredSum = floored.reduce((s, r) => s + r.floor, 0);
  let leftover = 100 - flooredSum;

  // Distribute leftover percentage points to the entries with the largest
  // fractional remainders. Ties broken by current order (i.e. bytes-desc).
  if (leftover > 0) {
    const byRemainder = [...floored]
      .map((r, idx) => ({ ...r, idx }))
      .sort((a, b) => b.remainder - a.remainder || a.idx - b.idx);

    for (let i = 0; i < byRemainder.length && leftover > 0; i++) {
      floored[byRemainder[i].idx].floor += 1;
      leftover--;
    }
  }

  return floored.map(({ name, bytes, floor }) => ({
    name,
    bytes,
    pct: floor,
  }));
}
