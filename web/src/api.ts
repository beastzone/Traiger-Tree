import type { Changes, Family, Person, TreeData, TreeMeta } from './types';

const BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface Options {
  method?: string;
  body?: unknown;
  token?: string | null;
  keepalive?: boolean;
}

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  if (!BASE) throw new ApiError(0, 'API address is not configured (VITE_API_BASE)');
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      keepalive: opts.keepalive,
    });
  } catch {
    throw new ApiError(0, 'network error');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

function serializeChanges(c: Changes) {
  const people = { upsert: [] as Person[], delete: [] as string[] };
  const families = { upsert: [] as Family[], delete: [] as string[] };
  for (const [id, p] of c.people) (p ? people.upsert.push(p) : people.delete.push(id));
  for (const [id, f] of c.families) (f ? families.upsert.push(f) : families.delete.push(id));
  return { people, families, rootId: c.rootId };
}

export const api = {
  listTrees: () => request<{ trees: TreeMeta[] }>('/api/trees'),

  createTree: (name: string, password: string) =>
    request<{ tree: TreeMeta; token: string }>('/api/trees', { method: 'POST', body: { name, password } }),

  getTree: (id: string) => request<TreeData & { token?: string }>(`/api/trees/${id}`),

  auth: (id: string, password: string) =>
    request<{ token: string }>(`/api/trees/${id}/auth`, { method: 'POST', body: { password } }),

  updateTree: (id: string, token: string, patch: { name?: string; password?: string | null }) =>
    request<{ tree: TreeMeta; token: string }>(`/api/trees/${id}`, { method: 'PATCH', body: patch, token }),

  deleteTree: (id: string, token: string) => request<{ ok: true }>(`/api/trees/${id}`, { method: 'DELETE', token }),

  applyChanges: (id: string, token: string, changes: Changes, keepalive = false) =>
    request<{ ok: true; updatedAt: number }>(`/api/trees/${id}/changes`, {
      method: 'POST',
      body: serializeChanges(changes),
      token,
      keepalive,
    }),
};
