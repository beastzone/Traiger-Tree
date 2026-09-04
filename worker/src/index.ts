// Traiger Tree API — a small JSON API over D1.
//
// Trees are public to read. Editing requires the tree's edit token, which is
// handed out either freely (tree has no password) or in exchange for the
// admin password. Tokens are per-tree random secrets stored in the DB, so the
// worker needs no global secret of its own.

export interface Env {
  DB: D1Database;
}

type TreeRow = {
  id: string;
  name: string;
  password_hash: string | null;
  password_salt: string | null;
  edit_token: string;
  root_id: string | null;
  created_at: number;
  updated_at: number;
};

type PersonRow = {
  id: string;
  tree_id: string;
  name: string;
  photo: string | null;
  family_id: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  birth_date: string | null;
  death_date: string | null;
  gender: string | null;
};

type FamilyRow = {
  id: string;
  tree_id: string;
  partner_a: string | null;
  partner_b: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

// ---- limits -----------------------------------------------------------------

const MAX_NAME = 120;
const MAX_PHOTO = 250_000; // data URL chars; the client shrinks photos to ~300px
const MAX_BATCH = 500;
const MAX_BODY = 8_000_000;

// ---- helpers ----------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function bad(message: string): never {
  throw new HttpError(400, message);
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(v);
}

function cleanName(v: unknown): string {
  if (typeof v !== 'string') bad('name must be a string');
  const s = v.trim().replace(/\s+/g, ' ');
  if (!s) bad('name is required');
  if (s.length > MAX_NAME) bad(`name must be at most ${MAX_NAME} characters`);
  return s;
}

function cleanPhoto(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') bad('photo must be a string');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) bad('photo must be a base64 image data URL');
  if (v.length > MAX_PHOTO) bad('photo is too large');
  return v;
}

function cleanDate(v: unknown, label: string): string | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) bad(`${label} must be a YYYY-MM-DD date`);
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) bad(`${label} is not a real date`);
  if (y < 1000) bad(`${label} is too far in the past`);
  return v;
}

function cleanGender(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v !== 'f' && v !== 'm') bad('gender must be "f", "m" or empty');
  return v;
}

function cleanInt(v: unknown, fallback = 0): number {
  return Number.isInteger(v) ? (v as number) : fallback;
}

function randomId(bytes = 8): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, saltHex: string): Promise<string> {
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256);
  return hex(bits);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) throw new HttpError(413, 'request body too large');
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    bad('invalid JSON body');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) bad('body must be a JSON object');
  return body as Record<string, unknown>;
}

async function loadTree(env: Env, id: string): Promise<TreeRow> {
  const row = await env.DB.prepare('SELECT * FROM trees WHERE id = ?').bind(id).first<TreeRow>();
  if (!row) throw new HttpError(404, 'tree not found');
  return row;
}

function requireAuth(req: Request, tree: TreeRow): void {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !timingSafeEqual(token, tree.edit_token)) throw new HttpError(401, 'edit access required');
}

function publicTree(t: TreeRow) {
  return {
    id: t.id,
    name: t.name,
    hasPassword: !!t.password_hash,
    rootId: t.root_id,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

function publicPerson(p: PersonRow) {
  return {
    id: p.id,
    name: p.name,
    photo: p.photo,
    familyId: p.family_id,
    sortOrder: p.sort_order,
    birthDate: p.birth_date,
    deathDate: p.death_date,
    gender: p.gender,
  };
}

function publicFamily(f: FamilyRow) {
  return { id: f.id, partnerA: f.partner_a, partnerB: f.partner_b, sortOrder: f.sort_order };
}

// ---- routes -----------------------------------------------------------------

async function listTrees(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.name, t.password_hash, t.root_id, t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM people p WHERE p.tree_id = t.id) AS people_count
       FROM trees t ORDER BY t.updated_at DESC`,
  ).all<TreeRow & { people_count: number }>();
  return json({
    trees: results.map((t) => ({ ...publicTree(t), peopleCount: t.people_count })),
  });
}

async function createTree(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const name = cleanName(body.name);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length > 200) bad('password is too long');

  const now = Date.now();
  const id = randomId(6);
  const token = randomId(24);
  let hash: string | null = null;
  let salt: string | null = null;
  if (password) {
    salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    hash = await hashPassword(password, salt);
  }
  await env.DB.prepare(
    'INSERT INTO trees (id, name, password_hash, password_salt, edit_token, root_id, created_at, updated_at) VALUES (?,?,?,?,?,NULL,?,?)',
  )
    .bind(id, name, hash, salt, token, now, now)
    .run();
  return json({ tree: { ...publicTree({ id, name, password_hash: hash, password_salt: salt, edit_token: token, root_id: null, created_at: now, updated_at: now }), peopleCount: 0 }, token }, 201);
}

async function getTree(env: Env, id: string): Promise<Response> {
  const tree = await loadTree(env, id);
  const [people, families] = await Promise.all([
    env.DB.prepare('SELECT * FROM people WHERE tree_id = ? ORDER BY sort_order, created_at').bind(id).all<PersonRow>(),
    env.DB.prepare('SELECT * FROM families WHERE tree_id = ? ORDER BY sort_order, created_at').bind(id).all<FamilyRow>(),
  ]);
  return json({
    tree: publicTree(tree),
    people: people.results.map(publicPerson),
    families: families.results.map(publicFamily),
    // No password → anyone may edit, so hand the token out with the read.
    token: tree.password_hash ? undefined : tree.edit_token,
  });
}

async function authTree(req: Request, env: Env, id: string): Promise<Response> {
  const tree = await loadTree(env, id);
  const body = await readJson(req);
  if (!tree.password_hash || !tree.password_salt) return json({ token: tree.edit_token });
  const password = typeof body.password === 'string' ? body.password : '';
  const hash = await hashPassword(password, tree.password_salt);
  if (!timingSafeEqual(hash, tree.password_hash)) throw new HttpError(403, 'wrong password');
  return json({ token: tree.edit_token });
}

async function updateTree(req: Request, env: Env, id: string): Promise<Response> {
  const tree = await loadTree(env, id);
  requireAuth(req, tree);
  const body = await readJson(req);
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const args: unknown[] = [now];
  let token = tree.edit_token;

  if (body.name !== undefined) {
    sets.push('name = ?');
    args.push(cleanName(body.name));
  }
  if (body.password !== undefined) {
    if (body.password !== null && typeof body.password !== 'string') bad('password must be a string or null');
    const pw = (body.password as string | null) ?? '';
    if (pw.length > 200) bad('password is too long');
    // Changing (or clearing) the password rotates the token so old sessions drop off.
    token = randomId(24);
    sets.push('edit_token = ?');
    args.push(token);
    if (pw) {
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
      sets.push('password_hash = ?', 'password_salt = ?');
      args.push(await hashPassword(pw, salt), salt);
    } else {
      sets.push('password_hash = NULL', 'password_salt = NULL');
    }
  }
  args.push(id);
  await env.DB.prepare(`UPDATE trees SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
  const updated = await loadTree(env, id);
  return json({ tree: publicTree(updated), token });
}

async function deleteTree(req: Request, env: Env, id: string): Promise<Response> {
  const tree = await loadTree(env, id);
  requireAuth(req, tree);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM people WHERE tree_id = ?').bind(id),
    env.DB.prepare('DELETE FROM families WHERE tree_id = ?').bind(id),
    env.DB.prepare('DELETE FROM trees WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

/**
 * Apply a batch of changes atomically. Body shape:
 * {
 *   people:   { upsert?: Person[], delete?: string[] },
 *   families: { upsert?: Family[], delete?: string[] },
 *   rootId?:  string | null
 * }
 */
async function applyChanges(req: Request, env: Env, id: string): Promise<Response> {
  const tree = await loadTree(env, id);
  requireAuth(req, tree);
  const body = await readJson(req);
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];

  const people = (body.people ?? {}) as Record<string, unknown>;
  const families = (body.families ?? {}) as Record<string, unknown>;
  const upsertPeople = Array.isArray(people.upsert) ? people.upsert : [];
  const deletePeople = Array.isArray(people.delete) ? people.delete : [];
  const upsertFamilies = Array.isArray(families.upsert) ? families.upsert : [];
  const deleteFamilies = Array.isArray(families.delete) ? families.delete : [];

  if (upsertPeople.length + deletePeople.length + upsertFamilies.length + deleteFamilies.length > MAX_BATCH) {
    bad('too many changes in one batch');
  }

  for (const raw of upsertFamilies) {
    const f = raw as Record<string, unknown>;
    if (!isId(f.id)) bad('family id is invalid');
    const a = f.partnerA == null ? null : f.partnerA;
    const b = f.partnerB == null ? null : f.partnerB;
    if (a !== null && !isId(a)) bad('family partnerA is invalid');
    if (b !== null && !isId(b)) bad('family partnerB is invalid');
    stmts.push(
      env.DB.prepare(
        `INSERT INTO families (id, tree_id, partner_a, partner_b, sort_order, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET partner_a = excluded.partner_a, partner_b = excluded.partner_b,
           sort_order = excluded.sort_order, updated_at = excluded.updated_at
         WHERE families.tree_id = excluded.tree_id`,
      ).bind(f.id, id, a, b, cleanInt(f.sortOrder), now, now),
    );
  }

  for (const raw of upsertPeople) {
    const p = raw as Record<string, unknown>;
    if (!isId(p.id)) bad('person id is invalid');
    const familyId = p.familyId == null ? null : p.familyId;
    if (familyId !== null && !isId(familyId)) bad('person familyId is invalid');
    const birth = cleanDate(p.birthDate, 'birthDate');
    const death = cleanDate(p.deathDate, 'deathDate');
    if (birth && death && death < birth) bad('deathDate is before birthDate');
    stmts.push(
      env.DB.prepare(
        `INSERT INTO people (id, tree_id, name, photo, family_id, sort_order, created_at, updated_at, birth_date, death_date, gender)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, photo = excluded.photo, family_id = excluded.family_id,
           sort_order = excluded.sort_order, updated_at = excluded.updated_at,
           birth_date = excluded.birth_date, death_date = excluded.death_date, gender = excluded.gender
         WHERE people.tree_id = excluded.tree_id`,
      ).bind(p.id, id, cleanName(p.name), cleanPhoto(p.photo), familyId, cleanInt(p.sortOrder), now, now, birth, death, cleanGender(p.gender)),
    );
  }

  for (const pid of deletePeople) {
    if (!isId(pid)) bad('person id is invalid');
    stmts.push(env.DB.prepare('DELETE FROM people WHERE id = ? AND tree_id = ?').bind(pid, id));
  }
  for (const fid of deleteFamilies) {
    if (!isId(fid)) bad('family id is invalid');
    stmts.push(env.DB.prepare('DELETE FROM families WHERE id = ? AND tree_id = ?').bind(fid, id));
  }

  if (body.rootId !== undefined) {
    const rootId = body.rootId === null ? null : body.rootId;
    if (rootId !== null && !isId(rootId)) bad('rootId is invalid');
    stmts.push(env.DB.prepare('UPDATE trees SET root_id = ?, updated_at = ? WHERE id = ?').bind(rootId, now, id));
  } else {
    stmts.push(env.DB.prepare('UPDATE trees SET updated_at = ? WHERE id = ?').bind(now, id));
  }

  await env.DB.batch(stmts);
  return json({ ok: true, updatedAt: now });
}

// ---- router -----------------------------------------------------------------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(req.url);
    const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);

    try {
      if (parts[0] !== 'api') throw new HttpError(404, 'not found');

      if (parts[1] === 'health') return json({ ok: true });

      if (parts[1] === 'trees') {
        if (parts.length === 2) {
          if (req.method === 'GET') return await listTrees(env);
          if (req.method === 'POST') return await createTree(req, env);
          throw new HttpError(405, 'method not allowed');
        }
        const id = parts[2];
        if (!isId(id)) throw new HttpError(404, 'tree not found');

        if (parts.length === 3) {
          if (req.method === 'GET') return await getTree(env, id);
          if (req.method === 'PATCH') return await updateTree(req, env, id);
          if (req.method === 'DELETE') return await deleteTree(req, env, id);
          throw new HttpError(405, 'method not allowed');
        }
        if (parts.length === 4 && req.method === 'POST') {
          if (parts[3] === 'auth') return await authTree(req, env, id);
          if (parts[3] === 'changes') return await applyChanges(req, env, id);
        }
      }
      throw new HttpError(404, 'not found');
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'internal error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
