import type { Family, Gender, Person, TreeData } from './types';

/**
 * Describes how everyone in a tree relates to one chosen person ("me").
 * Blood relations come from the closest shared ancestor; the rest are worked
 * out through partners (in-laws, step-relations).
 */

interface Index {
  byId: Map<string, Person>;
  families: Map<string, Family>;
  parents: Map<string, string[]>;
  partners: Map<string, string[]>;
  childrenOf: Map<string, string[]>; // parent id -> children ids
}

function buildIndex(data: TreeData): Index {
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const families = new Map(data.families.map((f) => [f.id, f]));
  const parents = new Map<string, string[]>();
  const partners = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);

  for (const f of data.families) {
    if (f.partnerA && f.partnerB && byId.has(f.partnerA) && byId.has(f.partnerB)) {
      push(partners, f.partnerA, f.partnerB);
      push(partners, f.partnerB, f.partnerA);
    }
  }
  for (const p of data.people) {
    const fam = p.familyId ? families.get(p.familyId) : undefined;
    if (!fam) continue;
    for (const pid of [fam.partnerA, fam.partnerB]) {
      if (pid && byId.has(pid)) {
        push(parents, p.id, pid);
        push(childrenOf, pid, p.id);
      }
    }
  }
  return { byId, families, parents, partners, childrenOf };
}

/** Every ancestor of `id` (including itself at depth 0) with its shortest depth. */
function ancestors(ix: Index, id: string): Map<string, number> {
  const out = new Map<string, number>([[id, 0]]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = out.get(cur)!;
    for (const p of ix.parents.get(cur) ?? []) {
      if (!out.has(p)) {
        out.set(p, d + 1);
        queue.push(p);
      }
    }
  }
  return out;
}

// ---- wording -------------------------------------------------------------------

const word = (g: Gender, neutral: string, f: string, m: string) => (g === 'f' ? f : g === 'm' ? m : neutral);

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`;

function greats(n: number, base: string): string {
  // n = number of "great-" prefixes
  if (n <= 0) return base;
  if (n <= 3) return `${'great-'.repeat(n)}${base}`;
  return `${ordinal(n)} great-${base}`;
}

function descendantWord(depth: number, g: Gender): string {
  if (depth === 1) return word(g, 'child', 'daughter', 'son');
  return greats(depth - 2, word(g, 'grandchild', 'granddaughter', 'grandson'));
}

function ancestorWord(depth: number, g: Gender): string {
  if (depth === 1) return word(g, 'parent', 'mother', 'father');
  return greats(depth - 2, word(g, 'grandparent', 'grandmother', 'grandfather'));
}

function siblingWord(g: Gender): string {
  return word(g, 'sibling', 'sister', 'brother');
}

function auntWord(depth: number, g: Gender): string {
  // depth = other's depth from the shared ancestor; 2 → aunt/uncle
  return greats(depth - 2, word(g, 'aunt/uncle', 'aunt', 'uncle'));
}

function nieceWord(depth: number, g: Gender): string {
  // depth = other's depth from the shared ancestor; 2 → niece/nephew
  const base = word(g, 'niece/nephew', 'niece', 'nephew');
  if (depth === 2) return base;
  return greats(depth - 3, `grand-${base}`);
}

function cousinWord(a: number, b: number): string {
  const degree = Math.min(a, b) - 1;
  const removed = Math.abs(a - b);
  let s = `${ordinal(degree)} cousin`;
  if (removed === 1) s += ' once removed';
  else if (removed === 2) s += ' twice removed';
  else if (removed > 2) s += ` ${removed} times removed`;
  return s;
}

/**
 * Blood relation of `other` to `me`, phrased as "other is my ___".
 * Returns null when they share no ancestor.
 */
function bloodRelation(ix: Index, ancMe: Map<string, number>, me: string, other: string): string | null {
  if (me === other) return 'you';
  const ancOther = ancestors(ix, other);
  let best: { a: number; b: number } | null = null;
  for (const [anc, dMe] of ancMe) {
    const dOther = ancOther.get(anc);
    if (dOther === undefined) continue;
    if (!best || dMe + dOther < best.a + best.b || (dMe + dOther === best.a + best.b && Math.max(dMe, dOther) < Math.max(best.a, best.b))) {
      best = { a: dMe, b: dOther };
    }
  }
  if (!best) return null;
  const g = ix.byId.get(other)?.gender ?? null;
  const { a, b } = best; // a = my depth, b = their depth from the shared ancestor
  if (a === 0) return descendantWord(b, g);
  if (b === 0) return ancestorWord(a, g);
  if (a === 1 && b === 1) {
    const sameFamily = ix.byId.get(me)?.familyId && ix.byId.get(me)?.familyId === ix.byId.get(other)?.familyId;
    const shared = (ix.parents.get(me) ?? []).filter((p) => (ix.parents.get(other) ?? []).includes(p)).length;
    return sameFamily || shared >= 2 ? siblingWord(g) : `half-${siblingWord(g)}`;
  }
  if (a === 1) return nieceWord(b, g);
  if (b === 1) return auntWord(a, g);
  return cousinWord(a, b);
}

function inLaw(rel: string, g: Gender): string | null {
  // Partner of my blood relative.
  const auntish = /^((?:great-)*|(?:\w+ great-))(?:aunt\/uncle|aunt|uncle)$/.exec(rel);
  if (auntish) return `${auntish[1]}${word(g, 'aunt/uncle', 'aunt', 'uncle')}`;
  if (rel === word(g, 'child', 'daughter', 'son') || /^(?:child|daughter|son)$/.test(rel)) return word(g, 'child-in-law', 'daughter-in-law', 'son-in-law');
  if (/^(?:sibling|sister|brother)$/.test(rel)) return word(g, 'sibling-in-law', 'sister-in-law', 'brother-in-law');
  if (/^half-(?:sibling|sister|brother)$/.test(rel)) return word(g, 'sibling-in-law', 'sister-in-law', 'brother-in-law');
  if (/^(?:parent|mother|father)$/.test(rel)) return word(g, 'step-parent', 'stepmother', 'stepfather');
  if (/^(?:grandparent|grandmother|grandfather)$/.test(rel)) return word(g, 'step-grandparent', 'step-grandmother', 'step-grandfather');
  return null;
}

function partnersSide(rel: string, g: Gender): string | null {
  // Blood relative of my partner.
  if (/^(?:parent|mother|father)$/.test(rel)) return word(g, 'parent-in-law', 'mother-in-law', 'father-in-law');
  if (/^(?:sibling|sister|brother|half-sibling|half-sister|half-brother)$/.test(rel)) return word(g, 'sibling-in-law', 'sister-in-law', 'brother-in-law');
  if (/^(?:child|daughter|son)$/.test(rel)) return word(g, 'stepchild', 'stepdaughter', 'stepson');
  if (/^(?:grandchild|granddaughter|grandson)$/.test(rel)) return word(g, 'step-grandchild', 'step-granddaughter', 'step-grandson');
  if (/^(?:grandparent|grandmother|grandfather)$/.test(rel)) return word(g, 'grandparent-in-law', 'grandmother-in-law', 'grandfather-in-law');
  return null;
}

function relationWithPartner(rel: string, g: Gender): string {
  // Fallback phrasing for partners of relatives: "aunt's husband"
  const p = word(g, 'partner', 'wife', 'husband');
  return `${rel}'s ${p}`;
}

/** Map of personId → relation phrase ("other is my …"), for everyone reachable. */
export function relationMap(data: TreeData, meId: string): Map<string, string> {
  const ix = buildIndex(data);
  const out = new Map<string, string>();
  if (!ix.byId.has(meId)) return out;
  const ancMe = ancestors(ix, meId);
  const myPartners = ix.partners.get(meId) ?? [];
  const myParents = ix.parents.get(meId) ?? [];

  // Pre-compute blood relation from each of my partners' viewpoints (for in-laws).
  const ancOfPartner = new Map(myPartners.map((p) => [p, ancestors(ix, p)]));

  for (const other of data.people) {
    const g = other.gender;
    if (other.id === meId) {
      out.set(other.id, 'you');
      continue;
    }
    // 1. Blood
    const blood = bloodRelation(ix, ancMe, meId, other.id);
    if (blood) {
      out.set(other.id, blood);
      continue;
    }
    // 2. My partner
    if (myPartners.includes(other.id)) {
      out.set(other.id, word(g, 'partner', 'wife', 'husband'));
      continue;
    }
    // 3. Partner of a blood relative (son-in-law, stepmother, aunt's husband…)
    let found: string | null = null;
    for (const theirPartner of ix.partners.get(other.id) ?? []) {
      const rel = bloodRelation(ix, ancMe, meId, theirPartner);
      if (rel && rel !== 'you') {
        found = inLaw(rel, g) ?? relationWithPartner(rel, g);
        break;
      }
    }
    if (found) {
      out.set(other.id, found);
      continue;
    }
    // 4. Blood relative of my partner (mother-in-law, stepchild, partner's cousin…)
    for (const [p, ancP] of ancOfPartner) {
      const rel = bloodRelation(ix, ancP, p, other.id);
      if (rel && rel !== 'you') {
        found = partnersSide(rel, g) ?? `${word(ix.byId.get(p)?.gender ?? null, "partner's", "wife's", "husband's")} ${rel}`;
        break;
      }
    }
    if (found) {
      out.set(other.id, found);
      continue;
    }
    // 5. Step-sibling: child of a parent's partner who isn't my parent
    const stepParents = myParents.flatMap((pp) => ix.partners.get(pp) ?? []).filter((sp) => !myParents.includes(sp));
    if (stepParents.some((sp) => (ix.childrenOf.get(sp) ?? []).includes(other.id))) {
      out.set(other.id, word(g, 'step-sibling', 'stepsister', 'stepbrother'));
      continue;
    }
    // 6. Partner of my partner's relative ("wife's sister's husband")
    for (const [p, ancP] of ancOfPartner) {
      for (const theirPartner of ix.partners.get(other.id) ?? []) {
        const rel = bloodRelation(ix, ancP, p, theirPartner);
        if (rel && rel !== 'you') {
          found = `${word(ix.byId.get(p)?.gender ?? null, "partner's", "wife's", "husband's")} ${relationWithPartner(rel, g)}`;
          break;
        }
      }
      if (found) break;
    }
    if (found) out.set(other.id, found);
  }
  return out;
}

/** "your mother" / "your first cousin once removed" */
export function phrase(rel: string | undefined): string | null {
  if (!rel) return null;
  if (rel === 'you') return 'You';
  return `Your ${rel}`;
}
