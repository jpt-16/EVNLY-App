"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Accepts a full invite URL (https://getevnly.com/g/abc...) or a bare slug.
function extractSlug(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = /\/g\/([A-Za-z0-9]{12})/.exec(trimmed);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9]{12}$/.test(trimmed) ? trimmed : null;
}

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
      <div style={{ marginTop: 100 }}>
        <div className="logo">E</div>
        <h1 className="wordmark">EVNLY</h1>
        <p className="muted center" style={{ margin: "0 auto", maxWidth: 300, lineHeight: 1.5 }}>
          Split costs with anyone. No account needed to view or pay in.
        </p>
      </div>

      <div className="grow" />

      <div className="stack">
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
            {error && <p className="error">{error}</p>}
            <button className="btn btn--ghost" type="submit">
              Open split
            </button>
          </form>
        ) : (
          <button className="link-btn" onClick={() => setOpening(true)}>
            Have a link already? Open it
          </button>
        )}
      </div>
    </main>
  );
}
