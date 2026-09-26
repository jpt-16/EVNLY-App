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
