const PALETTE = [
  { bg: "#E6ECFB", fg: "#3E6AD9" },
  { bg: "#FBEBD9", fg: "#D07A2E" },
  { bg: "#ECE8E0", fg: "#3A3834" },
  { bg: "#E3F1E6", fg: "#2F7A45" },
  { bg: "#F4E4EF", fg: "#9A3D7A" },
];

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

function colorFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
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
  const c = colorFor(id);
  return (
    <span
      className={`avatar${selected ? " avatar--selected" : ""}`}
      style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
