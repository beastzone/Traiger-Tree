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

export interface Layout {
  nodes: Map<string, LayoutNode>;
  couples: CoupleLink[];
  branches: BranchLink[];
  /** Where a new child would sprout from, per family. */
  anchors: Map<string, { x: number; y: number }>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  roots: string[];
}

interface Unit {
  person: string;
  /** Person plus adjacent partners, left to right. */
  slots: string[];
  blocks: { family: Family; partner: string | null; children: Unit[] }[];
  width: number;
  childrenWidth: number;
}

export function layoutTree(people: Person[], families: Family[], rootId: string | null): Layout {
  const byId = new Map(people.map((p) => [p.id, p]));
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
    if (p.familyId) childrenOf.set(p.familyId, [...(childrenOf.get(p.familyId) ?? []), p]);
  }
  for (const list of familiesOf.values()) list.sort(sortF);
  for (const list of childrenOf.values()) list.sort(sortP);

  const claimed = new Set<string>();

  function build(pid: string): Unit {
    claimed.add(pid);
    const fams = familiesOf.get(pid) ?? [];
    const slots: string[] = [pid];
    const blocks: Unit['blocks'] = [];
    fams.forEach((f, i) => {
      const other = f.partnerA === pid ? f.partnerB : f.partnerA;
      let partner: string | null = null;
      if (other && byId.has(other) && !claimed.has(other)) {
        claimed.add(other);
        partner = other;
        // First partner sits to the left, later ones to the right.
        if (i === 0) slots.unshift(other);
        else slots.push(other);
      }
      const kids = (childrenOf.get(f.id) ?? []).filter((k) => !claimed.has(k.id)).map((k) => build(k.id));
      blocks.push({ family: f, partner, children: kids });
    });
    const unit: Unit = { person: pid, slots, blocks, width: 0, childrenWidth: 0 };
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

  const nodes = new Map<string, LayoutNode>();
  const couples: CoupleLink[] = [];
  const branches: BranchLink[] = [];
  const anchors = new Map<string, { x: number; y: number }>();

  function place(u: Unit, left: number, depth: number) {
    const y = depth * LEVEL_H;
    const unitWidth = u.slots.length * NODE_W + (u.slots.length - 1) * COUPLE_GAP;
    let sx = left + (u.width - unitWidth) / 2 + NODE_W / 2;
    for (const pid of u.slots) {
      nodes.set(pid, { id: pid, x: sx, y, depth });
      sx += NODE_W + COUPLE_GAP;
    }
    const me = nodes.get(u.person)!;

    // Family anchors: for a couple, the peak of the arch that joins the two
    // leaves above them; for a single parent, the leaf's tip.
    for (const b of u.blocks) {
      const partnerNode = b.partner ? nodes.get(b.partner) : undefined;
      if (partnerNode) {
        anchors.set(b.family.id, { x: (me.x + partnerNode.x) / 2, y: y + ARCH_RISE });
        couples.push({ familyId: b.family.id, a: me, b: partnerNode });
      } else {
        anchors.set(b.family.id, { x: me.x, y: y + NODE_H / 2 });
      }
    }

    let cx = left + (u.width - u.childrenWidth) / 2;
    let first = true;
    for (const b of u.blocks) {
      if (b.children.length === 0) continue;
      if (!first) cx += BLOCK_GAP;
      first = false;
      const anchor = anchors.get(b.family.id)!;
      b.children.forEach((c, i) => {
        if (i) cx += SIBLING_GAP;
        place(c, cx, depth + 1);
        const cn = nodes.get(c.person)!;
        branches.push({
          familyId: b.family.id,
          childId: c.person,
          from: anchor,
          to: { x: cn.x, y: cn.y - NODE_H / 2 },
          depth,
        });
        cx += c.width;
      });
    }
  }

  // The root first, then any people the root can't reach (each becomes its own
  // small tree to the right) so nothing is ever invisible.
  const roots: string[] = [];
  const order: string[] = [];
  if (rootId && byId.has(rootId)) order.push(rootId);
  for (const p of [...people].sort(sortP)) if (!p.familyId) order.push(p.id);
  for (const p of [...people].sort(sortP)) order.push(p.id);

  let left = 0;
  for (const pid of order) {
    if (claimed.has(pid)) continue;
    const unit = build(pid);
    if (roots.length) left += BLOCK_GAP * 2;
    place(unit, left, 0);
    left += unit.width;
    roots.push(pid);
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
