import { useRef, useState, type FormEvent } from 'react';
import { shrinkPhoto } from '../photo';
import type { Gender, PersonInput } from '../types';
import { Avatar } from './Avatar';

interface Props {
  title: string;
  lede?: string;
  initial?: Partial<PersonInput>;
  submitLabel: string;
  onSubmit: (input: PersonInput) => void;
  onCancel: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function PersonForm({ title, lede, initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [photo, setPhoto] = useState<string | null>(initial?.photo ?? null);
  const [gender, setGender] = useState<Gender>(initial?.gender ?? null);
  const [birth, setBirth] = useState(initial?.birthDate ?? '');
  const [death, setDeath] = useState(initial?.deathDate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setPhoto(await shrinkPhoto(file));
    } catch {
      setError("Couldn't read that image. Try a different one.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (!trimmed) {
      setError('Please enter a name.');
      return;
    }
    if (birth && death && death < birth) {
      setError('The date of death is before the date of birth.');
      return;
    }
    onSubmit({ name: trimmed, photo, gender, birthDate: birth || null, deathDate: death || null });
  };

  return (
    <form onSubmit={submit}>
      <h2>{title}</h2>
      {lede && <p className="lede">{lede}</p>}

      <div className="photo-picker">
        <Avatar name={name || '?'} photo={photo} size="xl" />
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Preparing…' : photo ? 'Change photo' : 'Add photo'}
          </button>
          {photo && (
            <button type="button" className="btn btn-quiet" onClick={() => setPhoto(null)}>
              Remove
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      </div>

      <div className="field">
        <label htmlFor="person-name">Name</label>
        <input
          id="person-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          autoComplete="off"
          autoFocus
          maxLength={120}
        />
      </div>

      <div className="field">
        <label>Referred to as</label>
        <div className="segmented" role="radiogroup" aria-label="Referred to as">
          {(
            [
              ['f', 'She / her'],
              ['m', 'He / him'],
              [null, 'Not set'],
            ] as [Gender, string][]
          ).map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              role="radio"
              aria-checked={gender === value}
              className={gender === value ? 'on' : undefined}
              onClick={() => setGender(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="hint">Used for words like mother, brother, aunt in the "relation to you" labels.</div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="person-birth">Date of birth</label>
          <input id="person-birth" type="date" value={birth} max={today()} onChange={(e) => setBirth(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="person-death">Date of death</label>
          <input id="person-death" type="date" value={death} min={birth || undefined} max={today()} onChange={(e) => setDeath(e.target.value)} />
          <div className="hint">Leave blank if living.</div>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {submitLabel}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
