// With no accounts, "who am I in this split" is remembered per device.

const keyFor = (slug: string) => `evnly:${slug}:me`;

export function getMe(slug: string): string | null {
  try {
    return localStorage.getItem(keyFor(slug));
  } catch {
    return null;
  }
}

export function setMe(slug: string, personId: string | null) {
  try {
    if (personId) localStorage.setItem(keyFor(slug), personId);
    else localStorage.removeItem(keyFor(slug));
  } catch {
    // storage unavailable (private mode etc.) — identity lasts for this page only
  }
}
