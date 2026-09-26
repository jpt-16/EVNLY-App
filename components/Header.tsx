import Link from "next/link";
import type { ReactNode } from "react";

export function Header({
  title,
  backHref,
  backLabel = "‹",
  serif = false,
  action,
}: {
  title: string;
  backHref: string;
  backLabel?: string;
  serif?: boolean;
  action?: ReactNode;
}) {
  return (
    <header className="header">
      <Link href={backHref} className="icon-btn" aria-label="Back">
        {backLabel}
      </Link>
      <h1 className={serif ? "header__title serif" : "header__title"}>{title}</h1>
      <div className="header__action">{action}</div>
    </header>
  );
}
