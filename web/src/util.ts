export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const TOKEN_PREFIX = 'traiger-tree:token:';

export function loadToken(treeId: string): string | null {
  try {
    return localStorage.getItem(TOKEN_PREFIX + treeId);
  } catch {
    return null;
  }
}

export function saveToken(treeId: string, token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_PREFIX + treeId, token);
    else localStorage.removeItem(TOKEN_PREFIX + treeId);
  } catch {
    /* private mode etc. */
  }
}

const ME_PREFIX = 'traiger-tree:me:';

/** Which person this device treats as "you" in a given tree. */
export function loadMe(treeId: string): string | null {
  try {
    return localStorage.getItem(ME_PREFIX + treeId);
  } catch {
    return null;
  }
}

export function saveMe(treeId: string, personId: string | null): void {
  try {
    if (personId) localStorage.setItem(ME_PREFIX + treeId, personId);
    else localStorage.removeItem(ME_PREFIX + treeId);
  } catch {
    /* ignore */
  }
}
