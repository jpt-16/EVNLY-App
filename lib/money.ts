// All money is handled as integer cents. Never do arithmetic on dollar floats.

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

// "32", "32.5", "32.50", "$1,032.50" -> cents. Returns null for anything else.
export function parseToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = Number(match[1]);
  const frac = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + frac;
  return Number.isSafeInteger(cents) ? cents : null;
}

// Mirrors add_expense in the database: leftover cents go one each to the
// first participants, so the shares always sum to the total.
export function splitEvenly(amountCents: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(amountCents / count);
  const remainder = amountCents % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

export const MAX_SHARE_WEIGHT = 1000;

// "1", "2", "0.5", ".25" -> weight. Positive, at most 2 decimals and at most
// MAX_SHARE_WEIGHT, matching what add_expense accepts. Returns null otherwise.
export function parseShareWeight(input: string): number | null {
  const trimmed = input.trim();
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(trimmed)) return null;
  const weight = Number(trimmed);
  return weight > 0 && weight <= MAX_SHARE_WEIGHT ? weight : null;
}

// Preview of add_expense's 'shares' branch; the server computes the real
// splits. Weights are converted to integer hundredths so the math is exact
// integers on both sides: each person gets floor(amount * w / total), then the
// leftover cents (fewer than the number of people) go one each to the first.
export function splitByShares(amountCents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const hundredths = weights.map((w) => Math.round(w * 100));
  const total = hundredths.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => 0);
  // amount (<= 1e8) * weight (<= 1e5) stays well under 2^53, so this is exact
  const shares = hundredths.map((w) => Math.floor((amountCents * w) / total));
  let leftover = amountCents - shares.reduce((a, b) => a + b, 0);
  for (let i = 0; leftover > 0; i++, leftover--) shares[i] += 1;
  return shares;
}
