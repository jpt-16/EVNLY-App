import Link from "next/link";
import { ChevronLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

export function Header({
  title,
  backHref,
  backIcon = "back",
  serif = false,
  action,
}: {
  title: string;
  backHref: string;
  backIcon?: "back" | "close";
  serif?: boolean;
  action?: ReactNode;
}) {
  return (
    <header className="header">
      <Link href={backHref} className="icon-btn" aria-label={backIcon === "close" ? "Close" : "Back"}>
        <Icon icon={backIcon === "close" ? X : ChevronLeft} size={20} />
      </Link>
      <h1 className={serif ? "header__title serif" : "header__title"}>{title}</h1>
      <div className="header__action">{action}</div>
    </header>
  );
}
