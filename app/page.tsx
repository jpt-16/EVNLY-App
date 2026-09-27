"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Avatar } from "@/components/Avatar";
import { formatCents } from "@/lib/money";

// Accepts a full invite URL (https://getevnly.com/g/abc...) or a bare slug.
function extractSlug(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = /\/g\/([A-Za-z0-9]{12})/.exec(trimmed);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9]{12}$/.test(trimmed) ? trimmed : null;
}

const EASE = [0.16, 1, 0.3, 1] as const;

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
      </motion.div>
    </main>
  );
}
