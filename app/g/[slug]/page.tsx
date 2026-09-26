"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Header } from "@/components/Header";
import { addPerson, claimPerson, getGroup, recordSettlement } from "@/lib/api";
import { getMe, setMe } from "@/lib/identity";
import { formatCents } from "@/lib/money";
import type { Expense, Group, Person, Settlement } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

type FeedItem = { kind: "expense"; item: Expense } | { kind: "settlement"; item: Settlement };

export default function GroupView() {
  const { slug } = useParams<{ slug: string }>();
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [me, setMeState] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"owe" | "owed" | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setGroup(await getGroup(slug));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    setMeState(getMe(slug));
    if (new URLSearchParams(window.location.search).has("created")) {
      setNotice("Split created — tap Invite to share the link.");
    }
    load();
  }, [slug, load]);

  useEffect(() => {
    if (group) document.title = `${group.name} · EVNLY`;
  }, [group]);

  if (error) return <Message title="Something went wrong" body={error} />;
  if (group === undefined) return <Message title="Loading…" />;
  if (group === null) return <Message title="Split not found" body="Check the link and try again." />;

  const byId = new Map(group.people.map((p) => [p.id, p]));
  const meValid = me && byId.has(me) ? me : null;

  if (!meValid) {
    return (
      <ClaimSpot
        group={group}
        onClaimed={(id) => {
          setMe(slug, id);
          setMeState(id);
          load();
        }}
      />
    );
  }

  const nameOf = (id: string) => (id === meValid ? "You" : byId.get(id)?.display_name ?? "Someone");
  const iOwe = group.balances.filter((b) => b.from_person === meValid);
  const owedToMe = group.balances.filter((b) => b.to_person === meValid);
  const totalOwe = iOwe.reduce((s, b) => s + b.amount_cents, 0);
  const totalOwed = owedToMe.reduce((s, b) => s + b.amount_cents, 0);
  const fmt = (c: number) => formatCents(c, group.currency);

  const daysLeft = Math.max(0, Math.ceil((new Date(group.archives_at).getTime() - Date.now()) / DAY_MS));

  const feed: FeedItem[] = [
    ...group.expenses.map((item) => ({ kind: "expense" as const, item })),
    ...group.settlements.map((item) => ({ kind: "settlement" as const, item })),
  ].sort((a, b) => b.item.created_at.localeCompare(a.item.created_at));

  async function settle(from: string, to: string, amount: number) {
    try {
      await recordSettlement(slug, from, to, amount);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function invite() {
    const url = `${window.location.origin}/g/${slug}`;
    const text = `Join "${group!.name}" on EVNLY to see what you owe`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "EVNLY", text, url });
        return;
      } catch {
        // cancelled — fall through to copy
      }
    }
    await navigator.clipboard.writeText(url);
    setNotice("Invite link copied.");
  }

  return (
    <main className="screen">
      <Header
        title={group.name}
        backHref="/"
        serif
        action={
          <button className="btn btn--primary btn--sm" onClick={invite}>
            Invite
          </button>
        }
      />

      <span className="badge">
        {group.is_archived
          ? "Archived · read-only"
          : `Archives in ${daysLeft} day${daysLeft === 1 ? "" : "s"} unless a new expense is added`}
      </span>

      {notice && <p className="muted small center">{notice}</p>}

      <div className="balances">
        <div className="card">
          <div className="balance-card__label">You&apos;re owed</div>
          <div className="balance-card__amount" style={{ color: "var(--primary)" }}>
            {fmt(totalOwed)}
          </div>
          <button
            className="btn btn--ghost btn--sm"
            style={{ width: "100%" }}
            disabled={totalOwed === 0}
            onClick={() => setPanel(panel === "owed" ? null : "owed")}
          >
            Send reminder
          </button>
        </div>
        <div className="card">
          <div className="balance-card__label">You owe</div>
          <div className="balance-card__amount" style={{ color: "var(--owe)" }}>
            {fmt(totalOwe)}
          </div>
          <button
            className="btn btn--owe btn--sm"
            style={{ width: "100%" }}
            disabled={totalOwe === 0}
            onClick={() => setPanel(panel === "owe" ? null : "owe")}
          >
            Settle up
          </button>
        </div>
      </div>

      {panel === "owe" && (
        <div className="card stack sheet">
          <strong>Settle up</strong>
          <p className="muted small" style={{ margin: 0 }}>
            Pay them however you like, then mark it settled here.
          </p>
          {iOwe.map((b) => (
            <div key={b.to_person} className="row">
              <Avatar id={b.to_person} name={nameOf(b.to_person)} size={32} />
              <span className="grow">
                {nameOf(b.to_person)} · {fmt(b.amount_cents)}
              </span>
              <button
                className="btn btn--owe btn--sm"
                disabled={group.is_archived}
                onClick={() => settle(meValid, b.to_person, b.amount_cents)}
              >
                Mark settled
              </button>
            </div>
          ))}
        </div>
      )}

      {panel === "owed" && (
        <div className="card stack sheet">
          <strong>Who owes you</strong>
          {owedToMe.map((b) => (
            <div key={b.from_person} className="row">
              <Avatar id={b.from_person} name={nameOf(b.from_person)} size={32} />
              <span className="grow">
                {nameOf(b.from_person)} · {fmt(b.amount_cents)}
              </span>
              <button
                className="btn btn--ghost btn--sm"
                disabled={group.is_archived}
                onClick={() => settle(b.from_person, meValid, b.amount_cents)}
              >
                Got paid
              </button>
            </div>
          ))}
          <button className="btn btn--primary btn--sm" onClick={invite}>
            Share link as a reminder
          </button>
        </div>
      )}

      <PeopleLine group={group} onAdded={load} />

      <div className="stack" style={{ paddingBottom: 96 }}>
        {feed.length === 0 && <p className="muted center">No expenses yet. Tap + to add the first one.</p>}
        {feed.map((f) =>
          f.kind === "expense" ? (
            <div key={f.item.id} className="card expense-row">
              <Avatar id={f.item.paid_by} name={byId.get(f.item.paid_by)?.display_name ?? "?"} />
              <div className="expense-row__main">
                <div className="expense-row__title">{f.item.description}</div>
                <div className="expense-row__sub">
                  {nameOf(f.item.paid_by)} paid ·{" "}
                  {f.item.split_type === "even"
                    ? `split ${f.item.splits.length} ways`
                    : f.item.split_type === "shares"
                      ? "split by shares"
                      : "custom split"}
                </div>
              </div>
              <div className="expense-row__amount">{fmt(f.item.amount_cents)}</div>
            </div>
          ) : (
            <div key={f.item.id} className="card expense-row">
              <Avatar id={f.item.from_person} name={byId.get(f.item.from_person)?.display_name ?? "?"} />
              <div className="expense-row__main">
                <div className="expense-row__title">
                  {nameOf(f.item.from_person)} paid {nameOf(f.item.to_person)}
                </div>
                <div className="expense-row__sub settled">✓ Settled</div>
              </div>
              <div className="expense-row__amount strike">{fmt(f.item.amount_cents)}</div>
            </div>
          ),
        )}
      </div>

      <p className="muted small center">
        Viewing as {byId.get(meValid)?.display_name}.{" "}
        <button
          className="link-btn"
          style={{ padding: 0, textDecoration: "underline" }}
          onClick={() => {
            setMe(slug, null);
            setMeState(null);
          }}
        >
          Not you?
        </button>
      </p>

      {!group.is_archived && (
        <Link href={`/g/${slug}/expense/new`} className="fab" aria-label="Add expense">
          +
        </Link>
      )}
    </main>
  );
}

function PeopleLine({ group, onAdded }: { group: Group; onAdded: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await addPerson(group.slug, name);
      setName("");
      setAdding(false);
      setError("");
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const n = group.people.length;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row muted small">
        <span className="grow">
          {n} {n === 1 ? "person" : "people"} · no signup needed to view
        </span>
        {!group.is_archived && (
          <button className="link-btn small" style={{ padding: 0 }} onClick={() => setAdding(!adding)}>
            + Add person
          </button>
        )}
      </div>
      {adding && (
        <form onSubmit={submit} className="row" style={{ marginTop: 8 }}>
          <input
            className="input"
            placeholder="Name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button className="btn btn--primary btn--sm" type="submit">
            Add
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function ClaimSpot({ group, onClaimed }: { group: Group; onClaimed: (personId: string) => void }) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function claim(p: Person) {
    setBusy(true);
    try {
      await claimPerson(group.slug, p.id);
      onClaimed(p.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const id = await addPerson(group.slug, newName);
      await claimPerson(group.slug, id);
      onClaimed(id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <Header title={group.name} backHref="/" serif />
      <h2 style={{ fontSize: 20, margin: "8px 0 4px" }}>Which one are you?</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Tap your name to claim your spot. No account needed.
      </p>
      <div className="stack">
        {group.people.map((p) => (
          <button
            key={p.id}
            className="card person-row"
            style={{ cursor: "pointer", textAlign: "left" }}
            disabled={busy}
            onClick={() => claim(p)}
          >
            <Avatar id={p.id} name={p.display_name} />
            <span className="person-row__name">{p.display_name}</span>
            <span className="muted small">{p.is_organizer ? "organizer" : p.claimed ? "claimed" : ""}</span>
          </button>
        ))}
      </div>
      {!group.is_archived && (
        <form onSubmit={join} className="stack" style={{ marginTop: 20 }}>
          <label className="label" htmlFor="join-name" style={{ margin: 0 }}>
            Not on the list?
          </label>
          <div className="row">
            <input
              id="join-name"
              className="input input--dashed"
              placeholder="Your name"
              value={newName}
              maxLength={40}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
              Join
            </button>
          </div>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <main className="screen">
      <div className="grow" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="logo">E</div>
        <h1 className="center" style={{ fontSize: 22 }}>
          {title}
        </h1>
        {body && <p className="muted center">{body}</p>}
        <Link href="/" className="btn btn--ghost" style={{ marginTop: 16 }}>
          Go to EVNLY
        </Link>
      </div>
    </main>
  );
}
