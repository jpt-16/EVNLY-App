import type { LucideIcon } from "lucide-react";

// A single stroke weight and default size for every icon in the app, so
// nothing reads as a mismatched icon set. Pass `size`/`strokeWidth` only to
// deviate deliberately (e.g. the FAB's larger plus).
export function Icon({
  icon: LucideIconComponent,
  size = 18,
  strokeWidth = 1.75,
  className,
}: {
  icon: LucideIcon;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return <LucideIconComponent size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
