"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Header } from "@/components/Header";
import { addExpense, getGroup } from "@/lib/api";
import { getMe } from "@/lib/identity";
import { formatCents, parseShareWeight, parseToCents, splitByShares, splitEvenly } from "@/lib/money";
import type { Group, Person, SplitType } from "@/lib/types";

const CUSTOM_INVALID = "Check the custom amounts.";
const CUSTOM_SUM = "Custom amounts must add up to the total.";
const SHARES_INVALID = "Share counts must be positive numbers, like 1 or 0.5.";
const SHARES_NONE = "Give at least one person a share.";
// Errors that come from the live custom/shares checks; they clear on their own
// once the inputs are fixed (the server's wording has no trailing period).
const SPLIT_ERRORS = new Set([CUSTOM_INVALID, CUSTOM_SUM, CUSTOM_SUM.slice(0, -1), SHARES_INVALID, SHARES_NONE]);

const DEFAULT_WEIGHT = "1";

function checkCustom(people: Person[], custom: Record<string, string>, amountCents: number | null) {
  const cents = people.map((p) => (custom[p.id]?.trim() ? parseToCents(custom[p.id]) : 0));
  const valid = cents.every((c) => c !== null);
  const remaining = (amountCents ?? 0) - cents.reduce<number>((s, c) => s + (c ?? 0), 0);
  return { cents, valid, remaining, addsUp: valid && !!amountCents && remaining === 0 };
}

// A blank or zero share count ("", "0", "0.0") leaves that person out of the split.
const isLeftOut = (raw: string) => /^\s*0*\.?0*\s*$/.test(raw);

function checkShares(people: Person[], weights: Record<string, string>) {
  const rows = people.map((p) => {
    const raw = weights[p.id] ?? DEFAULT_WEIGHT;
    return isLeftOut(raw)
      ? { id: p.id, leftOut: true, weight: null }
      : { id: p.id, leftOut: false, weight: parseShareWeight(raw) };
  });
  const included = rows.filter((r) => !r.leftOut);
  const anyInvalid = included.some((r) => r.weight === null);
  const valid = included.length > 0 && !anyInvalid;
  const total = valid ? included.reduce((s, r) => s + (r.weight as number), 0) : 0;
  return {
    rows,
    anyInvalid,
    valid,
    total,
    participants: included.map((r) => r.id),
    weights: included.map((r) => r.weight as number),
  };
}

export default function AddExpense() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [me, setMeState] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [splitType, setSplitType] = useState<SplitType>("even");
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const myId = getMe(slug);
    getGroup(slug)
      .then((g) => {
        if (!g || !myId || !g.people.some((p) => p.id === myId)) {
          // unknown split or no claimed identity yet — the group page handles both
          router.replace(`/g/${slug}`);
          return;
        }
        setGroup(g);
        setMeState(myId);
        setPaidBy(myId);
        setIncluded(new Set(g.people.map((p) => p.id)));
      })
      .catch((err) => setError((err as Error).message));
  }, [slug, router]);

  // Clear a custom/shares validation error as soon as the live check passes
  // again, instead of leaving it up until the next submit.
  useEffect(() => {
    if (!group) return;
    const fixed =
      splitType === "custom"
        ? checkCustom(group.people, custom, parseToCents(amount)).addsUp
        : splitType === "shares"
          ? checkShares(group.people, weights).valid
          : false;
    if (fixed) setError((e) => (SPLIT_ERRORS.has(e) ? "" : e));
  }, [group, amount, splitType, custom, weights]);

  if (!group || !me || !paidBy) {
    return (
      <main className="screen">
        <Header title="Add expense" backHref={`/g/${slug}`} backLabel="×" />
        <p className="muted center">{error || "Loading…"}</p>
      </main>
    );
  }

  const fmt = (c: number) => formatCents(c, group.currency);
  const nameOf = (id: string) =>
    id === me ? "You" : group.people.find((p) => p.id === id)?.display_name ?? "?";
  const amountCents = parseToCents(amount);

  // Keep participants in group order so leftover cents land deterministically.
  const participants = group.people.filter((p) => included.has(p.id)).map((p) => p.id);
  const evenShares = amountCents ? splitEvenly(amountCents, participants.length) : [];

  const {
    cents: customCents,
    valid: customValid,
    remaining,
  } = checkCustom(group.people, custom, amountCents);

  const shares = checkShares(group.people, weights);
  // Preview only; add_expense computes the real split server-side.
  const sharePreviewCents =
    shares.valid && amountCents ? splitByShares(amountCents, shares.weights) : null;
  const sharePreview = new Map(sharePreviewCents?.map((c, i) => [shares.participants[i], c]));

  function chooseSplitType(type: SplitType) {
    setSplitType(type);
    setError((e) => (SPLIT_ERRORS.has(e) ? "" : e));
  }

  function toggle(id: string) {
    const next = new Set(included);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setIncluded(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!amountCents) return setError("Enter an amount.");
    if (!description.trim()) return setError("Add what it's for.");
    if (splitType === "even" && participants.length === 0) return setError("Pick at least one person.");
    if (splitType === "custom") {
      if (!customValid) return setError(CUSTOM_INVALID);
      if (remaining !== 0) return setError(CUSTOM_SUM);
    }
    if (splitType === "shares" && !shares.valid) {
      return setError(shares.anyInvalid ? SHARES_INVALID : SHARES_NONE);
    }
    setSaving(true);
    try {
      await addExpense({
        slug,
        paidBy: paidBy!,
        description,
        amountCents,
        splitType,
        participants:
          splitType === "even"
            ? participants
            : splitType === "shares"
              ? shares.participants
              : group!.people.map((p) => p.id),
        shares: splitType === "custom" ? (customCents as number[]) : undefined,
        shareWeights: splitType === "shares" ? shares.weights : undefined,
      });
      router.push(`/g/${slug}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  let evenSummary = "";
  if (evenShares.length) {
    const hi = evenShares[0];
    const lo = evenShares[evenShares.length - 1];
    evenSummary = hi === lo ? `${fmt(hi)} each` : `${fmt(lo)}–${fmt(hi)} each`;
  }

  return (
    <main className="screen">
      <Header title="Add expense" backHref={`/g/${slug}`} backLabel="×" />
      <form onSubmit={submit} className="grow" style={{ display: "flex", flexDirection: "column" }}>
        <div className="amount">
          <div className="muted small">Amount</div>
          <input
            className="amount__input"
            inputMode="decimal"
            placeholder="$0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount"
            autoFocus
          />
        </div>

        <label className="label" htmlFor="desc">
          What&apos;s it for
        </label>
        <input
          id="desc"
          className="input"
          placeholder="Firewood + snacks"
          value={description}
          maxLength={120}
          onChange={(e) => setDescription(e.target.value)}
        />

        <span className="label">Paid by</span>
        <div className="payer-picker">
          {group.people.map((p) => (
            <button
              key={p.id}
              type="button"
              className="payer"
              aria-pressed={paidBy === p.id}
              onClick={() => setPaidBy(p.id)}
            >
              <Avatar id={p.id} name={p.display_name} size={52} selected={paidBy === p.id} />
              <span style={{ color: paidBy === p.id ? "var(--text)" : undefined }}>{nameOf(p.id)}</span>
            </button>
          ))}
        </div>

        <span className="label">Split</span>
        <div className="segmented">
          <button type="button" aria-pressed={splitType === "even"} onClick={() => chooseSplitType("even")}>
            Evenly
          </button>
          <button type="button" aria-pressed={splitType === "custom"} onClick={() => chooseSplitType("custom")}>
            Custom amounts
          </button>
          <button type="button" aria-pressed={splitType === "shares"} onClick={() => chooseSplitType("shares")}>
            Shares
          </button>
        </div>

        {splitType === "even" ? (
          <div className="stack" style={{ marginTop: 12 }}>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {group.people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chip"
                  aria-pressed={included.has(p.id)}
                  onClick={() => toggle(p.id)}
                >
                  {nameOf(p.id)}
                </button>
              ))}
            </div>
            <div className="card row">
              <span className="grow">{participants.map(nameOf).join(", ") || "Nobody selected"}</span>
              <span className="muted">{evenSummary}</span>
            </div>
          </div>
        ) : splitType === "shares" ? (
          <div className="stack" style={{ marginTop: 12 }}>
            <p className="muted small" style={{ margin: 0 }}>
              Shares per person — e.g. 2 for a couple, 0.5 for a kid. Leave blank or 0 to leave
              someone out.
            </p>
            {group.people.map((p, i) => (
              <div key={p.id} className="card row">
                <Avatar id={p.id} name={p.display_name} size={32} />
                <span className="grow">{nameOf(p.id)}</span>
                <span className="muted small">
                  {shares.rows[i].leftOut
                    ? "not in split"
                    : sharePreview.has(p.id)
                      ? fmt(sharePreview.get(p.id)!)
                      : "—"}
                </span>
                <input
                  className="input share-input"
                  inputMode="decimal"
                  value={weights[p.id] ?? DEFAULT_WEIGHT}
                  onChange={(e) => setWeights({ ...weights, [p.id]: e.target.value })}
                  aria-label={`${nameOf(p.id)} shares`}
                />
              </div>
            ))}
            <p className="small center" style={{ color: shares.valid ? "var(--success)" : "var(--muted)" }}>
              {shares.anyInvalid
                ? "Check the share counts above"
                : !shares.valid
                  ? "Give at least one person a share"
                  : `${Number(shares.total.toFixed(2))} shares total ✓`}
            </p>
          </div>
        ) : (
          <div className="stack" style={{ marginTop: 12 }}>
            {group.people.map((p) => (
              <div key={p.id} className="card row">
                <Avatar id={p.id} name={p.display_name} size={32} />
                <span className="grow">{nameOf(p.id)}</span>
                <input
                  className="input custom-input"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={custom[p.id] ?? ""}
                  onChange={(e) => setCustom({ ...custom, [p.id]: e.target.value })}
                  aria-label={`${nameOf(p.id)} owes`}
                />
              </div>
            ))}
            <p className="small center" style={{ color: remaining === 0 ? "var(--success)" : "var(--muted)" }}>
              {!customValid
                ? "Check the amounts above"
                : remaining === 0
                  ? "Adds up ✓"
                  : remaining > 0
                    ? `${fmt(remaining)} left to assign`
                    : `${fmt(-remaining)} over the total`}
            </p>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="grow" style={{ minHeight: 24 }} />

        <button className="btn btn--primary" type="submit" disabled={saving}>
          {saving ? "Adding…" : "Add expense"}
        </button>
      </form>
    </main>
  );
}
