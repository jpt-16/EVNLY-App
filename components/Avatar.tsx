// Colors live as CSS custom properties (see .avatar--0 … --4 in globals.css) so
// each swatch can shift for dark mode without touching this hashing logic.
const SWATCH_COUNT = 5;

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

function swatchFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % SWATCH_COUNT;
}

export function Avatar({
  id,
  name,
  size = 40,
  selected = false,
}: {
  id: string;
  name: string;
  size?: number;
  selected?: boolean;
}) {
  return (
    <span
      className={`avatar avatar--${swatchFor(id)}${selected ? " avatar--selected" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
