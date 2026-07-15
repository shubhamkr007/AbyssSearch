// Recent searches, persisted in localStorage and namespaced per tenant key.
// Never stores anything when the host sets `disable-history`.
const PREFIX = 'es-recent:';

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as unknown[]).map(String) : [];
  } catch {
    return [];
  }
}

export function getRecent(key: string, limit = 6): string[] {
  return read(key).slice(0, limit);
}

export function addRecent(key: string, term: string, limit = 6): string[] {
  const trimmed = term.trim();
  if (!trimmed) return getRecent(key, limit);
  const next = [trimmed, ...read(key).filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    limit,
  );
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode / quota) — degrade silently
  }
  return next;
}
