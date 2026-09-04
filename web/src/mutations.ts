import type { Changes, Family, Person, PersonInput, TreeData } from './types';
import { emptyChanges } from './types';

export interface Result {
  data: TreeData;
  changes: Changes;
}

const newId = () => crypto.randomUUID();

export function personById(data: TreeData, id: string): Person | undefined {
  return data.people.find((p) => p.id === id);
}

export function familyById(data: TreeData, id: string): Family | undefined {
  return data.families.find((f) => f.id === id);
}

/** Families in which this person is a partner. */
export function familiesOf(data: TreeData, personId: string): Family[] {
  return data.families
    .filter((f) => f.partnerA === personId || f.partnerB === personId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function childrenOf(data: TreeData, familyId: string): Person[] {
  return data.people.filter((p) => p.familyId === familyId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function partnerIn(data: TreeData, family: Family, personId: string): Person | undefined {
  const other = family.partnerA === personId ? family.partnerB : family.partnerA;
  return other ? personById(data, other) : undefined;
}

export function partnersOf(data: TreeData, personId: string): Person[] {
  return familiesOf(data, personId)
    .map((f) => partnerIn(data, f, personId))
    .filter((p): p is Person => !!p);
}

export function parentsOf(data: TreeData, personId: string): Person[] {
  const me = personById(data, personId);
  const fam = me?.familyId ? familyById(data, me.familyId) : undefined;
  if (!fam) return [];
  return [fam.partnerA, fam.partnerB].map((id) => (id ? personById(data, id) : undefined)).filter((p): p is Person => !!p);
}

export function isRoot(data: TreeData, personId: string): boolean {
  return data.tree.rootId === personId;
}

// ---- edits -------------------------------------------------------------------

function withPeople(data: TreeData, people: Person[]): TreeData {
  return { ...data, people };
}

function blank(input: PersonInput, familyId: string | null, sortOrder: number): Person {
  return { id: newId(), familyId, sortOrder, ...input };
}

export function addRoot(data: TreeData, input: PersonInput): Result {
  const person = blank(input, null, 0);
  const changes = emptyChanges();
  changes.people.set(person.id, person);
  changes.rootId = person.id;
  return {
    data: { ...data, tree: { ...data.tree, rootId: person.id }, people: [...data.people, person] },
    changes,
  };
}

export function addPartner(data: TreeData, personId: string, input: PersonInput): Result {
  const changes = emptyChanges();
  const partner = blank(input, null, 0);
  changes.people.set(partner.id, partner);

  const mine = familiesOf(data, personId);
  const open = mine.find((f) => !f.partnerA || !f.partnerB);
  let families = data.families;
  if (open) {
    const updated: Family = open.partnerA ? { ...open, partnerB: partner.id } : { ...open, partnerA: partner.id };
    families = families.map((f) => (f.id === open.id ? updated : f));
    changes.families.set(updated.id, updated);
  } else {
    const fam: Family = {
      id: newId(),
      partnerA: personId,
      partnerB: partner.id,
      sortOrder: mine.reduce((m, f) => Math.max(m, f.sortOrder + 1), 0),
    };
    families = [...families, fam];
    changes.families.set(fam.id, fam);
  }
  return { data: { ...data, people: [...data.people, partner], families }, changes };
}

/**
 * Add a child to a person. When the person is in several couples the caller
 * must say which one via `familyId`.
 */
export function addChild(data: TreeData, personId: string, input: PersonInput, familyId?: string): Result {
  const changes = emptyChanges();
  let families = data.families;
  let family = familyId ? familyById(data, familyId) : undefined;
  if (!family) {
    const mine = familiesOf(data, personId);
    if (mine.length === 1) family = mine[0];
    else if (mine.length > 1) throw new Error('choose which couple the child belongs to');
  }
  if (!family) {
    family = { id: newId(), partnerA: personId, partnerB: null, sortOrder: 0 };
    families = [...families, family];
    changes.families.set(family.id, family);
  }
  const siblings = childrenOf(data, family.id);
  const child = blank(
    input,
    family.id,
    siblings.reduce((m, s) => Math.max(m, s.sortOrder + 1), 0),
  );
  changes.people.set(child.id, child);
  return { data: { ...data, people: [...data.people, child], families }, changes };
}

/** Grow the tree downward (toward the roots): give the root a parent. */
export function addParent(data: TreeData, personId: string, input: PersonInput): Result {
  const me = personById(data, personId);
  if (!me || me.familyId) throw new Error('only a person without parents can be given one');
  const changes = emptyChanges();
  const parent = blank(input, null, 0);
  const fam: Family = { id: newId(), partnerA: parent.id, partnerB: null, sortOrder: 0 };
  const updatedMe: Person = { ...me, familyId: fam.id };
  changes.people.set(parent.id, parent);
  changes.people.set(updatedMe.id, updatedMe);
  changes.families.set(fam.id, fam);
  const people = data.people.map((p) => (p.id === me.id ? updatedMe : p)).concat(parent);
  const next: TreeData = { ...data, people, families: [...data.families, fam] };
  if (data.tree.rootId === personId) {
    next.tree = { ...data.tree, rootId: parent.id };
    changes.rootId = parent.id;
  }
  return { data: next, changes };
}

export function updatePerson(data: TreeData, id: string, patch: Partial<PersonInput>): Result {
  const me = personById(data, id);
  if (!me) throw new Error('person not found');
  const updated: Person = { ...me, ...patch };
  const changes = emptyChanges();
  changes.people.set(id, updated);
  return { data: withPeople(data, data.people.map((p) => (p.id === id ? updated : p))), changes };
}

interface DeletePlan {
  people: Set<string>;
  families: Set<string>;
  familyUpdates: Map<string, Family>;
  newRootId: string | null | undefined;
}

/**
 * Work out what removing a person takes with it. A couple survives the loss
 * of one partner, so their children stay. Children with no remaining parent
 * are removed along with everything below them.
 */
export function planDelete(data: TreeData, id: string): DeletePlan {
  const people = new Set<string>([id]);
  const families = new Set<string>();
  const familyUpdates = new Map<string, Family>();
  const queue = [id];
  while (queue.length) {
    const pid = queue.pop()!;
    for (const f of familiesOf(data, pid)) {
      if (families.has(f.id)) continue;
      const current = familyUpdates.get(f.id) ?? f;
      const otherId = current.partnerA === pid ? current.partnerB : current.partnerA;
      const otherAlive = otherId && !people.has(otherId) && personById(data, otherId);
      if (otherAlive) {
        familyUpdates.set(f.id, current.partnerA === pid ? { ...current, partnerA: null } : { ...current, partnerB: null });
      } else {
        families.add(f.id);
        familyUpdates.delete(f.id);
        for (const child of childrenOf(data, f.id)) {
          if (!people.has(child.id)) {
            people.add(child.id);
            queue.push(child.id);
          }
        }
      }
    }
  }

  let newRootId: string | null | undefined;
  if (data.tree.rootId === id) {
    // Hand the root to a surviving partner, preferring one with children.
    const survivors = familiesOf(data, id)
      .filter((f) => !families.has(f.id))
      .map((f) => ({ f, partner: partnerIn(data, f, id) }))
      .filter((x): x is { f: Family; partner: Person } => !!x.partner)
      .sort((a, b) => childrenOf(data, b.f.id).length - childrenOf(data, a.f.id).length);
    if (survivors.length) newRootId = survivors[0].partner.id;
    else {
      const remaining = data.people.filter((p) => !people.has(p.id) && !p.familyId);
      newRootId = remaining[0]?.id ?? null;
    }
  }
  return { people, families, familyUpdates, newRootId };
}

export function deletePerson(data: TreeData, id: string): Result {
  const plan = planDelete(data, id);
  const changes = emptyChanges();
  for (const pid of plan.people) changes.people.set(pid, null);
  for (const fid of plan.families) changes.families.set(fid, null);
  for (const [fid, f] of plan.familyUpdates) changes.families.set(fid, f);
  let tree = data.tree;
  if (plan.newRootId !== undefined) {
    tree = { ...tree, rootId: plan.newRootId };
    changes.rootId = plan.newRootId;
  }
  return {
    data: {
      ...data,
      tree,
      people: data.people.filter((p) => !plan.people.has(p.id)),
      families: data.families.filter((f) => !plan.families.has(f.id)).map((f) => plan.familyUpdates.get(f.id) ?? f),
    },
    changes,
  };
}

export function mergeChanges(into: Changes, from: Changes): void {
  for (const [id, p] of from.people) into.people.set(id, p);
  for (const [id, f] of from.families) into.families.set(id, f);
  if (from.rootId !== undefined) into.rootId = from.rootId;
}

export function hasChanges(c: Changes): boolean {
  return c.people.size > 0 || c.families.size > 0 || c.rootId !== undefined;
}
