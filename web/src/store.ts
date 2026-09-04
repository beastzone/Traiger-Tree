import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { hasChanges, mergeChanges, type Result } from './mutations';
import type { Changes, TreeData } from './types';
import { emptyChanges } from './types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unauthorized';

const DEBOUNCE_MS = 500;

/**
 * Loads a tree and auto-saves edits. Edits are applied optimistically, queued,
 * coalesced, and pushed to the API shortly after the last change.
 */
export function useTreeStore(treeId: string, token: string | null) {
  const [data, setData] = useState<TreeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverToken, setServerToken] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [reloadKey, setReloadKey] = useState(0);

  const dataRef = useRef<TreeData | null>(null);
  // Explicit token (from a password prompt) wins; otherwise the one the server
  // hands out for unprotected trees.
  const effectiveToken = token ?? serverToken;
  const tokenRef = useRef(effectiveToken);
  const pendingRef = useRef<Changes>(emptyChanges());
  const inFlightRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const attemptsRef = useRef(0);

  tokenRef.current = effectiveToken;

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setLoadError(null);
    api
      .getTree(treeId)
      .then((res) => {
        if (cancelled) return;
        const next: TreeData = { tree: res.tree, people: res.people, families: res.families };
        dataRef.current = next;
        setData(next);
        setServerToken(res.token ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'could not load tree');
      });
    return () => {
      cancelled = true;
    };
  }, [treeId, reloadKey]);

  const flush = useCallback(
    async (keepalive = false) => {
      if (inFlightRef.current || !hasChanges(pendingRef.current)) return;
      const tok = tokenRef.current;
      if (!tok) {
        setSaveStatus('unauthorized');
        return;
      }
      const batch = pendingRef.current;
      pendingRef.current = emptyChanges();
      inFlightRef.current = true;
      setSaveStatus('saving');
      try {
        await api.applyChanges(treeId, tok, batch, keepalive);
        attemptsRef.current = 0;
        inFlightRef.current = false;
        if (hasChanges(pendingRef.current)) void flush();
        else setSaveStatus('saved');
      } catch (err) {
        inFlightRef.current = false;
        // Put the failed batch back underneath anything queued since.
        const requeued = batch;
        mergeChanges(requeued, pendingRef.current);
        pendingRef.current = requeued;
        if (err instanceof ApiError && err.status === 401) {
          setSaveStatus('unauthorized');
          return;
        }
        setSaveStatus('error');
        attemptsRef.current += 1;
        const delay = Math.min(30_000, 1500 * 2 ** (attemptsRef.current - 1));
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => void flush(), delay);
      }
    },
    [treeId],
  );

  const schedule = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush]);

  /** Apply a pure mutation to the current state and queue its changes. */
  const apply = useCallback(
    (fn: (d: TreeData) => Result): Changes | undefined => {
      if (!dataRef.current) return undefined;
      const { data: next, changes } = fn(dataRef.current);
      dataRef.current = next;
      setData(next);
      mergeChanges(pendingRef.current, changes);
      // Show "Saving…" straight away so the pill never claims a stale "Saved".
      setSaveStatus((s) => (s === 'unauthorized' ? s : 'saving'));
      schedule();
      return changes;
    },
    [schedule],
  );

  const retry = useCallback(() => {
    attemptsRef.current = 0;
    void flush();
  }, [flush]);

  // Once a token arrives (after a password prompt), push anything waiting.
  useEffect(() => {
    if (effectiveToken && hasChanges(pendingRef.current)) retry();
  }, [effectiveToken, retry]);

  // Try hard to get the last edits out when the tab is backgrounded or closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flush]);

  const patchMeta = useCallback((patch: Partial<TreeData['tree']>) => {
    if (!dataRef.current) return;
    const next = { ...dataRef.current, tree: { ...dataRef.current.tree, ...patch } };
    dataRef.current = next;
    setData(next);
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { data, loadError, token: effectiveToken, saveStatus, apply, retry, reload, patchMeta };
}
