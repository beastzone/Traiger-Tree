import { useRef, useState, type FormEvent } from 'react';
import { shrinkPhoto } from '../photo';
import { Avatar } from './Avatar';

interface Props {
  title: string;
  lede?: string;
  initialName?: string;
  initialPhoto?: string | null;
  submitLabel: string;
  onSubmit: (name: string, photo: string | null) => void;
  onCancel: () => void;
}

export function PersonForm({ title, lede, initialName = '', initialPhoto = null, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [photo, setPhoto] = useState<string | null>(initialPhoto);
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
    onSubmit(trimmed, photo);
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
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void pick(e.target.files?.[0])}
        />
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
        {error && <div className="error-text">{error}</div>}
      </div>

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
