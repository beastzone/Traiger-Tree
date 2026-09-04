import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { navigate } from '../App';
import { Avatar } from '../components/Avatar';
import { IconBack, IconFit, IconMinus, IconMore, IconPlus } from '../components/Icons';
import { PersonForm } from '../components/PersonForm';
import { SearchBar } from '../components/SearchBar';
import { Confirm, Sheet } from '../components/Sheet';
import { TreeCanvas, type CanvasHandle } from '../components/TreeCanvas';
import { lifeSummary } from '../dates';
import { phrase, relationMap } from '../kinship';
import { layoutTree } from '../layout';
import * as M from '../mutations';
import { useTreeStore, type SaveStatus } from '../store';
import type { Changes, Person, PersonInput, TreeData } from '../types';
import { loadMe, loadToken, saveMe, saveToken } from '../util';

type SheetState =
  | { kind: 'password' }
  | { kind: 'person'; id: string }
  | { kind: 'form'; mode: 'root' | 'partner' | 'child' | 'parent' | 'edit'; personId?: string; familyId?: string }
  | { kind: 'pickFamily'; personId: string }
  | { kind: 'delete'; personId: string }
  | { kind: 'settings' }
  | { kind: 'deleteTree' }
  | null;

interface Props {
  id: string;
  mode: 'view' | 'edit';
}

export function TreePage({ id, mode }: Props) {
  const [storedToken, setStoredToken] = useState<string | null>(() => loadToken(id));
  const store = useTreeStore(id, storedToken);
  const token = store.token;
  const editing = mode === 'edit';

  const canvas = useRef<CanvasHandle>(null);
  const [meId, setMeIdState] = useState<string | null>(() => loadMe(id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const pendingFocus = useRef<string | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);

  const data = store.data;
  const layout = useMemo(
    () => (data ? layoutTree(data.people, data.families, data.tree.rootId) : null),
    [data],
  );
  const peopleMap = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p])), [data]);
  const relations = useMemo(() => (data && meId && peopleMap.has(meId) ? relationMap(data, meId) : null), [data, meId, peopleMap]);

  const setMe = useCallback(
    (pid: string | null) => {
      setMeIdState(pid);
      saveMe(id, pid);
    },
    [id],
  );

  // Ask for the password when editing a protected tree without a token.
  useEffect(() => {
    if (!data) return;
    if (editing && data.tree.hasPassword && !token) setSheet({ kind: 'password' });
    else if (sheet?.kind === 'password') setSheet(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, editing, token]);

  useEffect(() => {
    if (store.saveStatus === 'unauthorized') {
      saveToken(id, null);
      setStoredToken(null);
    }
  }, [store.saveStatus, id]);

  // Fly to a newly added person once the layout includes them.
  useEffect(() => {
    if (pendingFocus.current && layout?.nodes.has(pendingFocus.current)) {
      const target = pendingFocus.current;
      pendingFocus.current = null;
      requestAnimationFrame(() => canvas.current?.focusNode(target));
    }
  }, [layout]);

  const flash = useCallback((pid: string) => {
    window.clearTimeout(highlightTimer.current);
    setHighlightId(pid);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 2400);
  }, []);

  const goTo = useCallback(
    (pid: string) => {
      canvas.current?.focusNode(pid);
      flash(pid);
    },
    [flash],
  );

  const select = useCallback((pid: string | null) => {
    setSelectedId(pid);
    setSheet(pid ? { kind: 'person', id: pid } : null);
  }, []);

  const closeSheet = () => setSheet(null);

  const applyAndFocus = (fn: (d: TreeData) => M.Result) => {
    const before = new Set(data?.people.map((p) => p.id));
    const changes = store.apply(fn);
    const fresh = newPersonId(changes, before);
    if (fresh) {
      pendingFocus.current = fresh;
      setSelectedId(fresh);
    }
    setSheet(null);
  };

  const submitForm = (input: PersonInput) => {
    if (!sheet || sheet.kind !== 'form') return;
    const s = sheet;
    switch (s.mode) {
      case 'root':
        applyAndFocus((d) => M.addRoot(d, input));
        break;
      case 'partner':
        applyAndFocus((d) => M.addPartner(d, s.personId!, input));
        break;
      case 'child':
        applyAndFocus((d) => M.addChild(d, s.personId!, input, s.familyId));
        break;
      case 'parent':
        applyAndFocus((d) => M.addParent(d, s.personId!, input));
        break;
      case 'edit':
        store.apply((d) => M.updatePerson(d, s.personId!, input));
        setSheet({ kind: 'person', id: s.personId! });
        break;
    }
  };

  const startAddChild = (pid: string) => {
    if (!data) return;
    const fams = M.familiesOf(data, pid);
    if (fams.length > 1) setSheet({ kind: 'pickFamily', personId: pid });
    else setSheet({ kind: 'form', mode: 'child', personId: pid, familyId: fams[0]?.id });
  };

  if (store.loadError) {
    return (
      <div className="list-page">
        <button className="btn btn-quiet" onClick={() => navigate('/')}>
          ← All trees
        </button>
        <div className="status-line error-text">Couldn't open this tree: {store.loadError}</div>
      </div>
    );
  }

  if (!data || !layout) return <div className="status-line">Loading…</div>;

  const empty = data.people.length === 0;
  const selected = selectedId ? peopleMap.get(selectedId) : undefined;

  return (
    <div className="tree-page">
      <TreeCanvas
        ref={canvas}
        layout={layout}
        people={peopleMap}
        selectedId={selectedId}
        highlightId={highlightId}
        meId={meId}
        relations={relations}
        onSelect={select}
      />

      <div className="topbar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="icon-btn" aria-label="All trees" onClick={() => navigate('/')}>
            <IconBack />
          </button>
          <div className="topbar-title">
            <h2>{data.tree.name}</h2>
            <div className="sub">
              {editing ? <SavePill status={store.saveStatus} onRetry={store.retry} /> : <span>Viewing</span>}
            </div>
          </div>
          {editing ? (
            <>
              <button className="icon-btn" aria-label="Tree settings" onClick={() => setSheet({ kind: 'settings' })}>
                <IconMore />
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/t/${id}`)}>
                Done
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => navigate(`/t/${id}/edit`)}>
              Edit
            </button>
          )}
        </div>
        {!empty && (
          <div style={{ display: 'flex', marginTop: 8 }}>
            <SearchBar people={data.people} relations={relations} onPick={goTo} />
          </div>
        )}
      </div>

      {!empty && (
        <div className="zoom-controls">
          <button className="icon-btn" aria-label="Zoom in" onClick={() => canvas.current?.zoomBy(1.4)}>
            <IconPlus />
          </button>
          <button className="icon-btn" aria-label="Zoom out" onClick={() => canvas.current?.zoomBy(1 / 1.4)}>
            <IconMinus />
          </button>
          <button className="icon-btn" aria-label="Fit whole tree" onClick={() => canvas.current?.fit()}>
            <IconFit />
          </button>
        </div>
      )}

      {empty && (
        <div className="empty-tree">
          <div>
            <h2>Nothing planted yet</h2>
            {editing ? (
              <>
                <p>Start with the oldest person you know of. Partners, children and parents grow from there.</p>
                <button className="btn btn-primary" onClick={() => setSheet({ kind: 'form', mode: 'root' })}>
                  Add the first person
                </button>
              </>
            ) : (
              <>
                <p>This tree has no people in it yet.</p>
                <button className="btn btn-primary" onClick={() => navigate(`/t/${id}/edit`)}>
                  Start editing
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {sheet?.kind === 'password' && (
        <PasswordSheet
          treeName={data.tree.name}
          treeId={id}
          onToken={(t) => {
            saveToken(id, t);
            setStoredToken(t);
            setSheet(null);
          }}
          onCancel={() => navigate(`/t/${id}`, true)}
        />
      )}

      {sheet?.kind === 'person' && selected && (
        <Sheet onClose={() => select(null)}>
          <PersonDetails
            data={data}
            person={selected}
            editing={editing}
            isMe={meId === selected.id}
            relation={relations?.get(selected.id)}
            onSetMe={(v) => setMe(v ? selected.id : null)}
            onGoTo={(pid) => {
              select(pid);
              goTo(pid);
            }}
            onShow={() => {
              goTo(selected.id);
              setSheet(null);
            }}
            onEdit={() => setSheet({ kind: 'form', mode: 'edit', personId: selected.id })}
            onAddPartner={() => setSheet({ kind: 'form', mode: 'partner', personId: selected.id })}
            onAddChild={() => startAddChild(selected.id)}
            onAddParent={() => setSheet({ kind: 'form', mode: 'parent', personId: selected.id })}
            onDelete={() => setSheet({ kind: 'delete', personId: selected.id })}
          />
        </Sheet>
      )}

      {sheet?.kind === 'form' && (
        <Sheet onClose={closeSheet}>
          <PersonForm
            {...formCopy(sheet.mode, sheet.personId ? peopleMap.get(sheet.personId) : undefined, sheet.familyId, data)}
            initial={sheet.mode === 'edit' ? peopleMap.get(sheet.personId!) : undefined}
            onSubmit={submitForm}
            onCancel={sheet.mode === 'edit' ? () => setSheet({ kind: 'person', id: sheet.personId! }) : closeSheet}
          />
        </Sheet>
      )}

      {sheet?.kind === 'pickFamily' && (
        <Sheet onClose={closeSheet}>
          <h2>Child with whom?</h2>
          <p className="lede">{peopleMap.get(sheet.personId)?.name} has more than one partner.</p>
          <div className="stack">
            {M.familiesOf(data, sheet.personId).map((f) => {
              const partner = M.partnerIn(data, f, sheet.personId);
              return (
                <button
                  key={f.id}
                  className="btn btn-secondary"
                  onClick={() => setSheet({ kind: 'form', mode: 'child', personId: sheet.personId, familyId: f.id })}
                >
                  {partner ? `With ${partner.name}` : 'On their own'}
                </button>
              );
            })}
            <button className="btn btn-quiet" onClick={closeSheet}>
              Cancel
            </button>
          </div>
        </Sheet>
      )}

      {sheet?.kind === 'delete' && (
        <DeleteSheet
          data={data}
          personId={sheet.personId}
          onCancel={() => setSheet({ kind: 'person', id: sheet.personId })}
          onConfirm={() => {
            store.apply((d) => M.deletePerson(d, sheet.personId));
            setSelectedId(null);
            setSheet(null);
          }}
        />
      )}

      {sheet?.kind === 'settings' && (
        <SettingsSheet
          data={data}
          token={token}
          onClose={closeSheet}
          onMeta={(patch, newToken) => {
            store.patchMeta(patch);
            if (newToken) {
              saveToken(id, newToken);
              setStoredToken(newToken);
            }
          }}
          onDeleteTree={() => setSheet({ kind: 'deleteTree' })}
        />
      )}

      {sheet?.kind === 'deleteTree' && (
        <DeleteTreeSheet
          data={data}
          token={token}
          onCancel={() => setSheet({ kind: 'settings' })}
        />
      )}
    </div>
  );
}

// ---- pieces -------------------------------------------------------------------

function newPersonId(changes: Changes | undefined, before: Set<string>): string | null {
  if (!changes) return null;
  for (const [pid, p] of changes.people) if (p && !before.has(pid)) return pid;
  return null;
}

function formCopy(
  mode: 'root' | 'partner' | 'child' | 'parent' | 'edit',
  person: Person | undefined,
  familyId: string | undefined,
  data: TreeData,
): { title: string; lede?: string; submitLabel: string } {
  const who = person?.name ?? '';
  switch (mode) {
    case 'root':
      return { title: 'First person', lede: 'The tree grows up from here.', submitLabel: 'Plant' };
    case 'partner':
      return { title: `Partner of ${who}`, submitLabel: 'Add partner' };
    case 'child': {
      const fam = familyId ? M.familyById(data, familyId) : undefined;
      const other = fam && person ? M.partnerIn(data, fam, person.id) : undefined;
      return {
        title: `Child of ${who}${other ? ` & ${other.name}` : ''}`,
        submitLabel: 'Add child',
      };
    }
    case 'parent':
      return { title: `Parent of ${who}`, lede: 'They become the new root of the tree.', submitLabel: 'Add parent' };
    case 'edit':
      return { title: 'Edit person', submitLabel: 'Save' };
  }
}

function SavePill({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'idle') return <span>Editing</span>;
  if (status === 'saving') return <span className="save-pill saving">Saving…</span>;
  if (status === 'saved') return <span className="save-pill">Saved</span>;
  if (status === 'unauthorized') return <span className="save-pill error">Password needed</span>;
  return (
    <button className="save-pill error" style={{ border: 'none', cursor: 'pointer' }} onClick={onRetry}>
      Couldn't save — tap to retry
    </button>
  );
}

interface DetailsProps {
  data: TreeData;
  person: Person;
  editing: boolean;
  isMe: boolean;
  relation?: string;
  onSetMe: (isMe: boolean) => void;
  onGoTo: (id: string) => void;
  onShow: () => void;
  onEdit: () => void;
  onAddPartner: () => void;
  onAddChild: () => void;
  onAddParent: () => void;
  onDelete: () => void;
}

function PersonDetails({ data, person, editing, isMe, relation, onSetMe, onGoTo, onShow, onEdit, onAddPartner, onAddChild, onAddParent, onDelete }: DetailsProps) {
  const life = lifeSummary(person.birthDate, person.deathDate);
  const parents = M.parentsOf(data, person.id);
  const partners = M.partnersOf(data, person.id);
  const children = M.familiesOf(data, person.id).flatMap((f) => M.childrenOf(data, f.id));
  const canHaveParent = !person.familyId && M.isRoot(data, person.id);

  const names = (list: Person[]) =>
    list.map((p, i) => (
      <span key={p.id}>
        {i > 0 && ', '}
        <button type="button" onClick={() => onGoTo(p.id)}>
          {p.name}
        </button>
      </span>
    ));

  return (
    <>
      <div className="person-head">
        <Avatar name={person.name} photo={person.photo} size="lg" />
        <div>
          <h2>{person.name}</h2>
          {(life.age || life.dates) && (
            <div className="life">
              {life.age && <span className="age">{life.age}</span>}
              {life.age && life.dates && ' · '}
              {life.dates}
            </div>
          )}
          {!isMe && relation && <div className="relation-pill">{phrase(relation)}</div>}
          {isMe && <div className="relation-pill">This is you</div>}
        </div>
      </div>
      <ul className="relations">
        {parents.length > 0 && (
          <li>
            <span>Parents</span>
            <span>{names(parents)}</span>
          </li>
        )}
        {partners.length > 0 && (
          <li>
            <span>Partner{partners.length > 1 ? 's' : ''}</span>
            <span>{names(partners)}</span>
          </li>
        )}
        {children.length > 0 && (
          <li>
            <span>Children</span>
            <span>{names(children)}</span>
          </li>
        )}
      </ul>
      <div className="actions">
        <button className="btn btn-me" onClick={() => onSetMe(!isMe)}>
          {isMe ? "That's not me" : 'This is me'}
        </button>
        {editing ? (
          <>
            <button className="btn btn-primary" onClick={onAddChild}>
              Add child
            </button>
            <div className="btn-row">
              <button className="btn btn-secondary" onClick={onAddPartner}>
                Add partner
              </button>
              {canHaveParent && (
                <button className="btn btn-secondary" onClick={onAddParent}>
                  Add parent
                </button>
              )}
            </div>
            <div className="btn-row">
              <button className="btn btn-secondary" onClick={onEdit}>
                Edit
              </button>
              <button className="btn btn-danger" onClick={onDelete}>
                Delete
              </button>
            </div>
          </>
        ) : (
          <button className="btn btn-secondary" onClick={onShow}>
            Show in tree
          </button>
        )}
      </div>
    </>
  );
}

function DeleteSheet({
  data,
  personId,
  onCancel,
  onConfirm,
}: {
  data: TreeData;
  personId: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const person = M.personById(data, personId);
  if (!person) return null;
  const plan = M.planDelete(data, personId);
  const removed = [...plan.people].filter((pid) => pid !== personId).map((pid) => M.personById(data, pid)!).filter(Boolean);
  const keptChildren = M.familiesOf(data, personId)
    .filter((f) => !plan.families.has(f.id))
    .flatMap((f) => M.childrenOf(data, f.id));
  const survivingPartners = M.familiesOf(data, personId)
    .filter((f) => !plan.families.has(f.id))
    .map((f) => M.partnerIn(data, f, personId))
    .filter((p): p is Person => !!p);

  return (
    <Confirm title={`Delete ${person.name}?`} confirmLabel={removed.length ? `Delete ${removed.length + 1} people` : 'Delete'} danger onConfirm={onConfirm} onCancel={onCancel}>
      {removed.length > 0 && (
        <div className="warning">
          <strong>
            {removed.length === 1 ? '1 person' : `${removed.length} people`} descend only from {person.name} and will be removed too:
          </strong>
          <ul>
            {removed.slice(0, 8).map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
            {removed.length > 8 && <li>…and {removed.length - 8} more</li>}
          </ul>
        </div>
      )}
      {keptChildren.length > 0 && (
        <p className="subtle" style={{ marginTop: 10 }}>
          {keptChildren.length === 1 ? 'Their child stays' : `Their ${keptChildren.length} children stay`} in the tree through{' '}
          {survivingPartners.map((p) => p.name).join(' and ')}.
        </p>
      )}
      {removed.length === 0 && keptChildren.length === 0 && <p className="subtle">This can't be undone.</p>}
    </Confirm>
  );
}

function PasswordSheet({
  treeName,
  treeId,
  onToken,
  onCancel,
}: {
  treeName: string;
  treeId: string;
  onToken: (t: string) => void;
  onCancel: () => void;
}) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.auth(treeId, pw);
      onToken(token);
    } catch (err) {
      setError(err instanceof Error && err.message === 'wrong password' ? "That's not the password." : 'Could not check the password. Try again.');
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onCancel}>
      <form onSubmit={(e) => void submit(e)}>
        <h2>Edit “{treeName}”</h2>
        <p className="lede">This tree is protected. Enter the edit password to make changes.</p>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" />
          {error && <div className="error-text">{error}</div>}
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Checking…' : 'Unlock'}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Just view
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function SettingsSheet({
  data,
  token,
  onClose,
  onMeta,
  onDeleteTree,
}: {
  data: TreeData;
  token: string | null;
  onClose: () => void;
  onMeta: (patch: Partial<TreeData['tree']>, token?: string) => void;
  onDeleteTree: () => void;
}) {
  const [name, setName] = useState(data.tree.name);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (what: string, patch: { name?: string; password?: string | null }, done: string) => {
    if (!token) return;
    setBusy(what);
    setError(null);
    setMsg(null);
    try {
      const res = await api.updateTree(data.tree.id, token, patch);
      onMeta({ name: res.tree.name, hasPassword: res.tree.hasPassword }, res.token);
      setMsg(done);
      setPw('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <h2>Tree settings</h2>
      <div className="section-title" style={{ marginTop: 14 }}>
        Name
      </div>
      <div className="field">
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Tree name" />
          <button
            className="btn btn-secondary"
            disabled={!!busy || !name.trim() || name.trim() === data.tree.name}
            onClick={() => void run('name', { name: name.trim() }, 'Renamed.')}
          >
            Save
          </button>
        </div>
      </div>

      <div className="section-title">Edit password</div>
      <div className="field">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={data.tree.hasPassword ? 'New password' : 'Set a password'}
            autoComplete="new-password"
            aria-label="New password"
          />
          <button className="btn btn-secondary" disabled={!!busy || !pw} onClick={() => void run('pw', { password: pw }, 'Password updated.')}>
            Set
          </button>
        </div>
        {data.tree.hasPassword && (
          <button className="btn btn-quiet btn-sm" style={{ marginTop: 8 }} disabled={!!busy} onClick={() => void run('pw', { password: null }, 'Password removed — anyone can edit now.')}>
            Remove password
          </button>
        )}
        <div className="hint">Changing the password signs other devices out of editing.</div>
      </div>

      {msg && <p className="subtle" style={{ color: 'var(--moss)' }}>{msg}</p>}
      {error && <div className="error-text">{error}</div>}

      <div className="divider" />
      <button className="btn btn-danger btn-block" onClick={onDeleteTree} disabled={!!busy}>
        Delete this tree
      </button>
      <div className="actions">
        <button className="btn btn-quiet" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}

function DeleteTreeSheet({ data, token, onCancel }: { data: TreeData; token: string | null; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = data.people.length;
  return (
    <Confirm
      title={`Delete “${data.tree.name}”?`}
      confirmLabel="Delete tree"
      danger
      busy={busy}
      onCancel={onCancel}
      onConfirm={() => {
        if (!token) return;
        setBusy(true);
        api
          .deleteTree(data.tree.id, token)
          .then(() => {
            saveToken(data.tree.id, null);
            navigate('/');
          })
          .catch((err: Error) => {
            setError(err.message);
            setBusy(false);
          });
      }}
    >
      <div className="warning">
        <strong>This removes the whole tree{n ? ` and all ${n} ${n === 1 ? 'person' : 'people'} in it` : ''}.</strong>
        It can't be undone.
      </div>
      {error && <div className="error-text">{error}</div>}
    </Confirm>
  );
}
