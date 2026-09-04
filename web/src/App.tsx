import { useEffect, useState } from 'react';
import { TreeList } from './pages/TreeList';
import { TreePage } from './pages/TreePage';

export type Route = { page: 'list' } | { page: 'tree'; id: string; mode: 'view' | 'edit' };

function parseHash(): Route {
  const parts = window.location.hash.replace(/^#/, '').split('/').filter(Boolean);
  if (parts[0] === 't' && parts[1]) return { page: 'tree', id: parts[1], mode: parts[2] === 'edit' ? 'edit' : 'view' };
  return { page: 'list' };
}

export function navigate(path: string, replace = false): void {
  if (replace) window.history.replaceState(null, '', `#${path}`);
  else window.location.hash = path;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  if (route.page === 'tree') return <TreePage key={route.id} id={route.id} mode={route.mode} />;
  return <TreeList />;
}
