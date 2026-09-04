export type Gender = 'f' | 'm' | null;

export interface Person {
  id: string;
  name: string;
  photo: string | null;
  /** The family (couple) this person was born into, if any. */
  familyId: string | null;
  sortOrder: number;
  /** YYYY-MM-DD */
  birthDate: string | null;
  /** YYYY-MM-DD, null while living */
  deathDate: string | null;
  /** How relationship words are phrased: 'f' → mother/sister, 'm' → father/brother, null → parent/sibling. */
  gender: Gender;
}

export interface PersonInput {
  name: string;
  photo: string | null;
  birthDate: string | null;
  deathDate: string | null;
  gender: Gender;
}

export interface Family {
  id: string;
  partnerA: string | null;
  partnerB: string | null;
  sortOrder: number;
}

export interface TreeMeta {
  id: string;
  name: string;
  hasPassword: boolean;
  rootId: string | null;
  createdAt: number;
  updatedAt: number;
  peopleCount?: number;
}

export interface TreeData {
  tree: TreeMeta;
  people: Person[];
  families: Family[];
}

/** A batch of edits, keyed by id. `null` means delete. */
export interface Changes {
  people: Map<string, Person | null>;
  families: Map<string, Family | null>;
  rootId?: string | null;
}

export function emptyChanges(): Changes {
  return { people: new Map(), families: new Map() };
}
