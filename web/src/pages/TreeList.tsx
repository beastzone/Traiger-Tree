import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { navigate } from '../App';
import { IconLeaf, IconLock, IconPlus } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import type { TreeMeta } from '../types';
import { saveToken, timeAgo } from '../util';

export function TreeList() {
  const [trees, setTrees] = useState<TreeMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .listTrees()
      .then((r) => setTrees(r.trees))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="list-page">
      <header className="list-header">
        <div className="eyebrow">Family trees</div>
        <h1>Traiger Tree</h1>
        <p>Start a tree for your family, or open one someone has already planted.</p>
      </header>

      <div className="list-actions">
        <button className="btn btn-primary btn-block" onClick={() => setCreating(true)}>
          <span style={{ display: 'inline-flex', width: 18, height: 18 }}>
            <IconPlus />
          </span>
          New tree
        </button>
      </div>

      {error && <div className="status-line error-text">Couldn't load trees: {error}</div>}
      {!error && trees === null && <div className="status-line">Loading…</div>}
      {trees && trees.length === 0 && (
        <div className="empty-list">No trees yet. Plant the first one.</div>
      )}
      {trees?.map((t) => (
        <article className="tree-card" key={t.id}>
          <div className="tree-card-top">
            <div className="tree-card-icon">
              <IconLeaf />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3>{t.name}</h3>
              <div className="meta">
                <span>
                  {t.peopleCount ?? 0} {t.peopleCount === 1 ? 'person' : 'people'}
                </span>
                <span>·</span>
                <span>{timeAgo(t.updatedAt)}</span>
                {t.hasPassword && (
                  <>
                    <span>·</span>
                    <span className="lock">
                      <IconLock /> protected
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => navigate(`/t/${t.id}`)}>
              View
            </button>
            <button className="btn btn-primary" onClick={() => navigate(`/t/${t.id}/edit`)}>
              Edit
            </button>
          </div>
        </article>
      ))}

      {creating && <NewTreeSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewTreeSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the tree a name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.createTree(trimmed, password);
      saveToken(res.tree.id, res.token);
      navigate(`/t/${res.tree.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={busy ? undefined : onClose}>
      <form onSubmit={(e) => void submit(e)}>
        <h2>New tree</h2>
        <p className="lede">Anyone can view it. Set a password if only some people should be able to edit.</p>
        <div className="field">
          <label htmlFor="tree-name">Tree name</label>
          <input
            id="tree-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Traiger family"
            autoFocus
            maxLength={120}
          />
        </div>
        <div className="field">
          <label htmlFor="tree-password">Edit password (optional)</label>
          <input
            id="tree-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to let anyone edit"
            autoComplete="new-password"
          />
          <div className="hint">You'll need this to make changes from another device.</div>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Planting…' : 'Create tree'}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
