import { useEffect, useMemo, useRef, useState } from 'react';
import { yearsLabel } from '../dates';
import { phrase } from '../kinship';
import type { Person } from '../types';
import { Avatar } from './Avatar';
import { IconClose, IconSearch } from './Icons';

interface Props {
  people: Person[];
  relations?: Map<string, string> | null;
  /** One-line context per person ("child of A & B", "partner of C") so same-named people can be told apart. */
  context?: Map<string, string>;
  onPick: (id: string) => void;
}

export function SearchBar({ people, relations, context, onPick }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const starts: Person[] = [];
    const contains: Person[] = [];
    for (const p of people) {
      const hay = p.name.toLowerCase();
      if (hay.startsWith(needle) || hay.split(/\s+/).some((w) => w.startsWith(needle))) starts.push(p);
      else if (hay.includes(needle)) contains.push(p);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [q, people]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const choose = (p: Person) => {
    setQ(p.name);
    setOpen(false);
    input.current?.blur();
    onPick(p.id);
  };

  return (
    <div className="search-wrap" ref={wrap}>
      <div className="search-input">
        <IconSearch />
        <input
          ref={input}
          type="search"
          value={q}
          placeholder="Find someone"
          aria-label="Search people"
          autoComplete="off"
          enterKeyHint="search"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (results[active]) choose(results[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
              input.current?.blur();
            }
          }}
        />
        {q && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Clear search"
            onClick={() => {
              setQ('');
              setOpen(false);
              input.current?.focus();
            }}
          >
            <IconClose />
          </button>
        )}
      </div>
      {open && q.trim() && (
        <div className="search-results">
          {results.length === 0 && <div className="empty">No one by that name.</div>}
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={i === active ? 'active' : undefined}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
            >
              <Avatar name={p.name} photo={p.photo} />
              <span>
                {p.name}
                {(yearsLabel(p.birthDate, p.deathDate) || context?.get(p.id) || relations?.get(p.id)) && (
                  <span className="sub">
                    {[yearsLabel(p.birthDate, p.deathDate), context?.get(p.id), phrase(relations?.get(p.id))].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
