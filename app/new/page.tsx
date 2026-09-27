"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Header } from "@/components/Header";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Icon } from "@/components/Icon";
import { createGroup } from "@/lib/api";
import { setMe } from "@/lib/identity";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function NewSplit() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [yourName, setYourName] = useState("");
  const [others, setOthers] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function addDraft() {
    const n = draft.trim();
    if (!n) return;
    const taken = [yourName, ...others].some((x) => x.trim().toLowerCase() === n.toLowerCase());
    if (taken) {
      setError(`${n} is already in this split.`);
      return;
    }
    setOthers([...others, n]);
    setDraft("");
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !yourName.trim()) {
      setError("Add a name for the split and your name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // include a name typed but not yet added with "+"
      const names = draft.trim() ? [...others, draft.trim()] : others;
      const { slug, person_id } = await createGroup(name, yourName, names);
      setMe(slug, person_id);
      router.push(`/g/${slug}?created=1`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <main className="screen">
      <Header title="New split" backHref="/" />
      <form onSubmit={submit} className="grow" style={{ display: "flex", flexDirection: "column" }}>
        <label className="label" htmlFor="split-name">
          What&apos;s this for
        </label>
        <input
          id="split-name"
          className="input"
          placeholder="Ski trip"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="label" htmlFor="your-name">
          Who&apos;s splitting this
        </label>
        <div className="stack">
          <div className="card person-row">
            <Avatar id="organizer" name={yourName || "You"} />
            <input
              id="your-name"
              className="person-row__name"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 17 }}
              placeholder="Your name"
              value={yourName}
              maxLength={40}
              onChange={(e) => setYourName(e.target.value)}
            />
            <span className="muted small">organizer</span>
          </div>

          <AnimatePresence initial={false}>
            {others.map((n, i) => (
              <motion.div
                key={n}
                className="card person-row"
                initial={{ opacity: 0, height: 0, marginBottom: -10 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: -10 }}
                transition={{ duration: 0.2, ease: EASE }}
                style={{ overflow: "hidden" }}
              >
                <Avatar id={n} name={n} />
                <span className="person-row__name">{n}</span>
                <button
                  type="button"
                  className="remove-btn"
                  aria-label={`Remove ${n}`}
                  onClick={() => setOthers(others.filter((_, j) => j !== i))}
                >
                  <Icon icon={X} size={16} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          <div className="row">
            <input
              className="input input--dashed"
              placeholder="Add a name"
              value={draft}
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDraft();
                }
              }}
            />
            <button type="button" className="icon-btn" style={{ background: "var(--chip)" }} onClick={addDraft} aria-label="Add person">
              <Icon icon={Plus} size={18} />
            </button>
          </div>
        </div>

        <p className="muted small" style={{ lineHeight: 1.5 }}>
          Don&apos;t have everyone&apos;s info yet? Add names now — anyone can claim their spot when they open
          the invite link.
        </p>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <div className="grow" />

        <button className="btn btn--primary" type="submit" disabled={saving}>
          {saving ? "Creating…" : "Create split & get invite link"}
        </button>
        <p className="muted center" style={{ fontSize: 13 }}>
          This split archives automatically 14 days after the last expense
        </p>
      </form>
    </main>
  );
}
