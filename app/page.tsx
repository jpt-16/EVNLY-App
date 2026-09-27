"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { Link2, Receipt, UserPlus, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { formatCents } from "@/lib/money";

// Accepts a full invite URL (https://getevnly.com/g/abc...) or a bare slug.
function extractSlug(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = /\/g\/([A-Za-z0-9]{12})/.exec(trimmed);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9]{12}$/.test(trimmed) ? trimmed : null;
}

const EASE = [0.16, 1, 0.3, 1] as const;

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: UserPlus,
    title: "Start a split",
    body: "Name it — a trip, a dinner, the house — and add everyone by first name. No emails, no phone numbers.",
  },
  {
    icon: Link2,
    title: "Share the link",
    body: "Send the invite link anywhere. Friends open it, tap their name, and they're in. Nobody makes an account.",
  },
  {
    icon: Receipt,
    title: "Add expenses",
    body: "Log who paid and split it evenly, by exact amounts, or by shares — like 2 for a couple, 0.5 for a kid.",
  },
  {
    icon: Wallet,
    title: "Settle up",
    body: "EVNLY keeps a running tally of who owes whom. Pay however you like, then mark it settled.",
  },
];

export default function Landing() {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");

  function open(e: React.FormEvent) {
    e.preventDefault();
    const slug = extractSlug(link);
    if (!slug) {
      setError("That doesn't look like an EVNLY link.");
      return;
    }
    router.push(`/g/${slug}`);
  }

  return (
    <main className="screen">
      <motion.div
        style={{ marginTop: 88 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="logo">E</div>
        <h1 className="wordmark">EVNLY</h1>
        <p className="muted center" style={{ margin: "0 auto", maxWidth: 300, lineHeight: 1.5 }}>
          Split costs with anyone. No account needed to view or pay in.
        </p>

        <div className="example-card">
          <div className="card row" style={{ width: "100%" }}>
            <Avatar id="example" name="JD" />
            <span className="grow small">
              You paid <strong>{formatCents(6400)}</strong> for <strong>Cabin — weekend trip</strong>
            </span>
          </div>
        </div>
        <p className="example-card__label">example of a split you&apos;d create</p>
      </motion.div>

      <div className="grow" />

      <motion.div
        className="stack"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
      >
        <Link href="/new" className="btn btn--primary">
          Start a new split
        </Link>
        {opening ? (
          <form onSubmit={open} className="stack" style={{ marginTop: 8 }}>
            <input
              className="input"
              placeholder="Paste your invite link"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setError("");
              }}
              autoFocus
            />
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <button className="btn btn--ghost" type="submit">
              Open split
            </button>
          </form>
        ) : (
          <button className="link-btn" onClick={() => setOpening(true)}>
            Have a link already? Open it
          </button>
        )}
        <a href="#how-it-works" className="link-btn small center">
          How it works ↓
        </a>
      </motion.div>

      <section id="how-it-works" className="how" aria-labelledby="how-title">
        <h2 id="how-title" className="how__title serif">
          How it works
        </h2>
        <ol className="how__steps">
          {STEPS.map((step, i) => (
            <motion.li
              key={step.title}
              className="how__step"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.06, ease: EASE }}
            >
              <span className="how__icon">
                <Icon icon={step.icon} size={20} />
              </span>
              <div>
                <h3 className="how__step-title">
                  <span className="how__num">{i + 1}</span>
                  {step.title}
                </h3>
                <p className="how__body">{step.body}</p>
              </div>
            </motion.li>
          ))}
        </ol>
        <p className="how__note muted small center">
          Splits archive automatically 14 days after the last expense, so nothing lingers.
        </p>
        <Link href="/new" className="btn btn--primary">
          Start a new split
        </Link>
      </section>
    </main>
  );
}
