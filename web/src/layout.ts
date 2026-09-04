import type { Family, Person } from './types';

// Node geometry (in tree units, before zoom). y grows *downward* here — the
// canvas flips it so the root sits at the bottom like a real tree.
export const NODE_W = 120;
export const NODE_H = 150;
export const LEVEL_H = 235;
export const COUPLE_GAP = 30;
export const SIBLING_GAP = 30;
export const BLOCK_GAP = 60;
/** Height of a couple's arch above leaf centre: the two stems fuse here and children grow from it. */
export const ARCH_RISE = NODE_H / 2 + 18;

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  depth: number;
}

export interface CoupleLink {
  familyId: string;
  a: LayoutNode;
  b: LayoutNode;
}

export interface BranchLink {
  familyId: string;
  childId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  depth: number;
}

export interface Anchor {
  x: number;
  y: number;
  depth: number;
}

export interface Layout {
  nodes: Map<string, LayoutNode>;
  couples: CoupleLink[];
  branches: BranchLink[];
  /** Where a family's children sprout from. */
  anchors: Map<string, Anchor>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** People with a trunk under them: the main root plus the root of each in-law lineage. */
  roots: string[];
}

/**
 * A "unit" is a couple cluster (a person, their partners, their partners'
 * other partners…) on one level, with each family's children hanging above.
 */
interface Unit {
  /** The person this unit was built from; a block's trunk stands under them. */
  root: string;
  slots: string[];
  blocks: { family: Family; children: Unit[] }[];
  width: number;
  childrenWidth: number;
}

/** Horizontal half-width reserved under a root for its trunk and ground shadow. */
const TRUNK_HALF_W = 80;
/** How many generations below a root its trunk zone is kept clear. */
const TRUNK_DEPTHS = 6;

export function layoutTree(people: Person[], families: Family[], rootId: string | null): Layout {
  const byId = new Map(people.map((p) => [p.id, p]));
  const famById = new Map(families.map((f) => [f.id, f]));
  const sortP = (a: Person, b: Person) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  const sortF = (a: Family, b: Family) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);

  const familiesOf = new Map<string, Family[]>();
  const childrenOf = new Map<string, Person[]>();
  for (const f of families) {
    for (const pid of [f.partnerA, f.partnerB]) {
      if (pid && byId.has(pid)) familiesOf.set(pid, [...(familiesOf.get(pid) ?? []), f]);
    }
  }
  for (const p of people) {
    if (p.familyId && famById.has(p.familyId)) childrenOf.set(p.familyId, [...(childrenOf.get(p.familyId) ?? []), p]);
  }
  for (const list of familiesOf.values()) list.sort(sortF);
  for (const list of childrenOf.values()) list.sort(sortP);

  const otherPartner = (f: Family, pid: string) => (f.partnerA === pid ? f.partnerB : f.partnerA);
  const parentsOf = (pid: string): string[] => {
    const f = byId.get(pid)?.familyId;
    const fam = f ? famById.get(f) : undefined;
    return fam ? [fam.partnerA, fam.partnerB].filter((x): x is string => !!x && byId.has(x)) : [];
  };

  const claimed = new Set<string>();
  const nodes = new Map<string, LayoutNode>();
  const couples: CoupleLink[] = [];
  const branches: BranchLink[] = [];
  const anchors = new Map<string, Anchor>();
  const roots: string[] = [];
  /** depth → occupied x-intervals of placed leaves, for collision checks. */
  const occupied = new Map<number, [number, number][]>();

  // ---- build ---------------------------------------------------------------

  function buildCluster(pid: string): string[] {
    claimed.add(pid);
    const order = [pid];
    const grow = (person: string, side: 'left' | 'right') => {
      for (const f of familiesOf.get(person) ?? []) {
        const other = otherPartner(f, person);
        if (other && byId.has(other) && !claimed.has(other)) {
          claimed.add(other);
          if (side === 'left') order.unshift(other);
          else order.push(other);
          grow(other, side);
        }
      }
    };
    (familiesOf.get(pid) ?? []).forEach((f, i) => {
      const other = otherPartner(f, pid);
      if (other && byId.has(other) && !claimed.has(other)) {
        claimed.add(other);
        const side = i === 0 ? 'left' : 'right';
        if (side === 'left') order.unshift(other);
        else order.push(other);
        grow(other, side);
      }
    });
    return order;
  }

  function build(pid: string): Unit {
    const slots = buildCluster(pid);
    const slotIndex = new Map(slots.map((s, i) => [s, i]));
    // Every family with a partner in this cluster, ordered by where it sits.
    const seen = new Set<string>();
    const fams: Family[] = [];
    for (const s of slots) {
      for (const f of familiesOf.get(s) ?? []) {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          fams.push(f);
        }
      }
    }
    const pos = (f: Family) =>
      Math.min(...[f.partnerA, f.partnerB].map((p) => (p && slotIndex.has(p) ? slotIndex.get(p)! : Infinity)));
    fams.sort((a, b) => pos(a) - pos(b) || sortF(a, b));

    const blocks: Unit['blocks'] = fams.map((f) => ({
      family: f,
      children: (childrenOf.get(f.id) ?? []).filter((k) => !claimed.has(k.id)).map((k) => build(k.id)),
    }));
    const unit: Unit = { root: pid, slots, blocks, width: 0, childrenWidth: 0 };
    measure(unit);
    return unit;
  }

  function measure(u: Unit) {
    const unitWidth = u.slots.length * NODE_W + (u.slots.length - 1) * COUPLE_GAP;
    let cw = 0;
    let first = true;
    for (const b of u.blocks) {
      if (b.children.length === 0) continue;
      if (!first) cw += BLOCK_GAP;
      first = false;
      cw += b.children.reduce((s, c, i) => s + c.width + (i ? SIBLING_GAP : 0), 0);
    }
    u.childrenWidth = cw;
    u.width = Math.max(unitWidth, cw);
  }

  // ---- place ---------------------------------------------------------------

  interface Placed {
    rootId: string;
    nodeIds: string[];
    familyIds: string[];
    coupleFrom: number;
    branchFrom: number;
  }

  /** The x-intervals a root's trunk needs clear, per depth, for a given shift. */
  function trunkZone(p: Placed, dx: number): [number, number, number][] {
    const r = nodes.get(p.rootId)!;
    const out: [number, number, number][] = [];
    for (let d = r.depth; d > r.depth - TRUNK_DEPTHS; d--) out.push([d, r.x + dx - TRUNK_HALF_W, r.x + dx + TRUNK_HALF_W]);
    return out;
  }

  function place(u: Unit, left: number, depth: number, out: Placed) {
    const y = depth * LEVEL_H;
    const unitWidth = u.slots.length * NODE_W + (u.slots.length - 1) * COUPLE_GAP;
    let sx = left + (u.width - unitWidth) / 2 + NODE_W / 2;
    for (const pid of u.slots) {
      nodes.set(pid, { id: pid, x: sx, y, depth });
      out.nodeIds.push(pid);
      sx += NODE_W + COUPLE_GAP;
    }

    // Family anchors: a couple's arch peak; a single parent's leaf tip.
    for (const b of u.blocks) {
      const f = b.family;
      const a = f.partnerA && nodes.has(f.partnerA) && u.slots.includes(f.partnerA) ? nodes.get(f.partnerA)! : null;
      const c = f.partnerB && nodes.has(f.partnerB) && u.slots.includes(f.partnerB) ? nodes.get(f.partnerB)! : null;
      if (a && c) {
        anchors.set(f.id, { x: (a.x + c.x) / 2, y: y + ARCH_RISE, depth });
        couples.push({ familyId: f.id, a, b: c });
      } else {
        const solo = a ?? c;
        if (solo) anchors.set(f.id, { x: solo.x, y: y + NODE_H / 2, depth });
      }
      if (anchors.has(f.id)) out.familyIds.push(f.id);
    }

    let cx = left + (u.width - u.childrenWidth) / 2;
    let first = true;
    for (const b of u.blocks) {
      if (b.children.length === 0) continue;
      if (!first) cx += BLOCK_GAP;
      first = false;
      const anchor = anchors.get(b.family.id);
      b.children.forEach((c, i) => {
        if (i) cx += SIBLING_GAP;
        place(c, cx, depth + 1, out);
        if (anchor) {
          const cn = nodes.get(c.slots[0])!;
          const child = c.slots.find((s) => byId.get(s)?.familyId === b.family.id) ?? c.slots[0];
          const node = nodes.get(child) ?? cn;
          branches.push({
            familyId: b.family.id,
            childId: child,
            from: anchor,
            to: { x: node.x, y: node.y - NODE_H / 2 },
            depth,
          });
        }
        cx += c.width;
      });
    }
  }

  function translate(p: Placed, dx: number) {
    if (!dx) return;
    for (const id of p.nodeIds) {
      const n = nodes.get(id)!;
      n.x += dx;
    }
    for (const fid of p.familyIds) anchors.get(fid)!.x += dx;
    // A branch's `from` *is* the shared anchor object (already moved above);
    // only its `to` point is its own.
    for (let i = p.branchFrom; i < branches.length; i++) {
      branches[i].to = { ...branches[i].to, x: branches[i].to.x + dx };
    }
    // Couple links reference node objects, so they move with them.
  }

  function occupy(p: Placed) {
    const add = (depth: number, lo: number, hi: number) => {
      const list = occupied.get(depth) ?? [];
      list.push([lo, hi]);
      occupied.set(depth, list);
    };
    for (const id of p.nodeIds) {
      const n = nodes.get(id)!;
      add(n.depth, n.x - NODE_W / 2, n.x + NODE_W / 2);
    }
    for (const [d, lo, hi] of trunkZone(p, 0)) add(d, lo, hi);
  }

  function clear(depth: number, lo: number, hi: number): boolean {
    for (const [a, b] of occupied.get(depth) ?? []) {
      if (!(hi + SIBLING_GAP <= a || b + SIBLING_GAP <= lo)) return false;
    }
    return true;
  }

  function fits(p: Placed, dx: number): boolean {
    for (const id of p.nodeIds) {
      const n = nodes.get(id)!;
      if (!clear(n.depth, n.x + dx - NODE_W / 2, n.x + dx + NODE_W / 2)) return false;
    }
    for (const [d, lo, hi] of trunkZone(p, dx)) if (!clear(d, lo, hi)) return false;
    return true;
  }

  /** Place a unit as its own block, as close to `desiredLeft` as the others allow. */
  function placeBlock(u: Unit, depth: number, desiredLeft: number, anchorHint?: { familyId: string; x: number }) {
    const out: Placed = { rootId: u.root, nodeIds: [], familyIds: [], coupleFrom: couples.length, branchFrom: branches.length };
    place(u, 0, depth, out);
    // Where would we like to be? Under the person this lineage connects to, if given.
    let want = desiredLeft;
    if (anchorHint && anchors.has(anchorHint.familyId)) want = anchorHint.x - anchors.get(anchorHint.familyId)!.x;
    let chosen: number | null = null;
    const step = 24;
    for (let k = 0; k < 600 && chosen === null; k++) {
      for (const cand of k === 0 ? [want] : [want + k * step, want - k * step]) {
        if (fits(out, cand)) {
          chosen = cand;
          break;
        }
      }
    }
    if (chosen === null) chosen = extentRight() + BLOCK_GAP * 2;
    translate(out, chosen);
    occupy(out);
    roots.push(u.root);
  }

  function extentRight(): number {
    let max = -Infinity;
    for (const n of nodes.values()) max = Math.max(max, n.x + NODE_W / 2);
    return Number.isFinite(max) ? max : 0;
  }

  /** The most distant ancestor of `pid` (deepest lineage root) and how many generations up it is. */
  function topmost(pid: string): { id: string; up: number } {
    let best = { id: pid, up: 0 };
    const seen = new Set([pid]);
    const queue: { id: string; up: number }[] = [{ id: pid, up: 0 }];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.up > best.up) best = cur;
      for (const par of parentsOf(cur.id)) {
        if (!seen.has(par) && !claimed.has(par)) {
          seen.add(par);
          queue.push({ id: par, up: cur.up + 1 });
        }
      }
    }
    return best;
  }

  // 1. The main tree.
  const mainRoot = rootId && byId.has(rootId) ? rootId : [...people].sort(sortP).find((p) => !p.familyId)?.id ?? people[0]?.id;
  if (mainRoot) placeBlock(build(mainRoot), 0, 0);

  // 2. Lineages of married-in people: whoever has parents that aren't placed
  //    yet gets their family tree laid out beside the main one, one generation
  //    down, as near as possible to them.
  let progress = true;
  while (progress) {
    progress = false;
    for (const n of [...nodes.values()]) {
      const p = byId.get(n.id)!;
      if (!p.familyId || !famById.has(p.familyId) || anchors.has(p.familyId)) continue;
      const top = topmost(n.id);
      if (top.id === n.id || claimed.has(top.id)) continue;
      const unit = build(top.id);
      placeBlock(unit, n.depth - top.up, n.x - unit.width / 2, { familyId: p.familyId, x: n.x });
      progress = true;
      break;
    }
  }

  // 3. Anyone still unplaced (disconnected) becomes a small tree on the right.
  for (const p of [...people].sort(sortP)) {
    if (claimed.has(p.id)) continue;
    const start = topmost(p.id);
    const unit = build(start.id);
    placeBlock(unit, -start.up, extentRight() + BLOCK_GAP * 2);
  }

  // 4. Every placed person whose birth family is placed gets a branch from it —
  //    this connects married-in people to their lineage (and cousin marriages).
  const linked = new Set(branches.map((b) => `${b.familyId}:${b.childId}`));
  for (const n of nodes.values()) {
    const fid = byId.get(n.id)?.familyId;
    if (!fid) continue;
    const anchor = anchors.get(fid);
    if (!anchor || linked.has(`${fid}:${n.id}`)) continue;
    branches.push({ familyId: fid, childId: n.id, from: anchor, to: { x: n.x, y: n.y - NODE_H / 2 }, depth: anchor.depth });
  }

  const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let init = false;
  for (const n of nodes.values()) {
    if (!init) {
      bounds.minX = n.x - NODE_W / 2;
      bounds.maxX = n.x + NODE_W / 2;
      bounds.minY = n.y - NODE_H / 2;
      bounds.maxY = n.y + NODE_H / 2;
      init = true;
    } else {
      bounds.minX = Math.min(bounds.minX, n.x - NODE_W / 2);
      bounds.maxX = Math.max(bounds.maxX, n.x + NODE_W / 2);
      bounds.minY = Math.min(bounds.minY, n.y - NODE_H / 2);
      bounds.maxY = Math.max(bounds.maxY, n.y + NODE_H / 2);
    }
  }
  return { nodes, couples, branches, anchors, bounds, roots };
}
