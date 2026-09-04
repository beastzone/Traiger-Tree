/** Date helpers for YYYY-MM-DD strings, avoiding timezone drift. */

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

export function parseYmd(s: string | null | undefined): Ymd | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function todayYmd(): Ymd {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

/** Whole years and months elapsed from `from` to `to` (calendar arithmetic). */
export function ageBetween(from: Ymd, to: Ymd): { years: number; months: number } | null {
  let months = (to.y - from.y) * 12 + (to.m - from.m);
  if (to.d < from.d) months -= 1;
  if (months < 0) return null;
  return { years: Math.floor(months / 12), months: months % 12 };
}

export function formatAge(a: { years: number; months: number }): string {
  const y = a.years === 1 ? '1 year' : `${a.years} years`;
  const m = a.months === 1 ? '1 month' : `${a.months} months`;
  if (a.years === 0) return m;
  if (a.months === 0) return y;
  return `${y} ${m}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatYmd(s: string | null | undefined): string | null {
  const p = parseYmd(s);
  if (!p) return null;
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

export interface LifeSummary {
  /** e.g. "21 years 3 months" or "Lived 84 years 2 months" */
  age: string | null;
  /** e.g. "Born 12 Mar 2004" or "12 Mar 1932 – 4 Jun 2016" */
  dates: string | null;
  deceased: boolean;
}

export function lifeSummary(birthDate: string | null, deathDate: string | null): LifeSummary {
  const b = parseYmd(birthDate);
  const d = parseYmd(deathDate);
  const deceased = !!d;
  let age: string | null = null;
  if (b) {
    const a = ageBetween(b, d ?? todayYmd());
    if (a) age = deceased ? `Lived ${formatAge(a)}` : formatAge(a);
  }
  let dates: string | null = null;
  const fb = formatYmd(birthDate);
  const fd = formatYmd(deathDate);
  if (fb && fd) dates = `${fb} – ${fd}`;
  else if (fb) dates = `Born ${fb}`;
  else if (fd) dates = `Died ${fd}`;
  return { age, dates, deceased };
}

/** Short "1932–2016" / "b. 1990" / "d. 2016" for tight spaces. */
export function yearsLabel(birthDate: string | null, deathDate: string | null): string | null {
  const b = parseYmd(birthDate);
  const d = parseYmd(deathDate);
  if (b && d) return `${b.y}–${d.y}`;
  if (b) return `b. ${b.y}`;
  if (d) return `d. ${d.y}`;
  return null;
}
